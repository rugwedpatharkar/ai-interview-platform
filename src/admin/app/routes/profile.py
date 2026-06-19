"""gRPC ProfileService route layer — a thin adapter over app/resources/profile."""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import auth as auth_res
from app.resources import profile as profile_res
from app.routes.auth import _STATUS, _bearer_from_metadata
from app.routes.pb import profile_pb2, profile_pb2_grpc

log = get_logger(component="profile.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _profile_response(d):
    return profile_pb2.ProfileResponse(
        user_id=d["user_id"],
        resume_uploaded=d["resume_uploaded"],
        parsed=d["parsed"],
        confirmed=d["confirmed"],
        completeness=d["completeness"],
        full_name=d["full_name"],
        age=d["age"],
        location=d["location"],
        willing_to_relocate=d["willing_to_relocate"],
        job_preference=d["job_preference"],
        experience=[
            profile_pb2.ExperienceItem(
                company=e.get("company", ""),
                title=e.get("title", ""),
                summary=e.get("summary", ""),
            )
            for e in d["experience"]
        ],
        education=[
            profile_pb2.EducationItem(
                institution=e.get("institution", ""),
                degree=e.get("degree", ""),
                year=e.get("year", ""),
            )
            for e in d["education"]
        ],
        skills=list(d["skills"]),
    )


class ProfileServicer(profile_pb2_grpc.ProfileServiceServicer):
    def __init__(self, *, profiles, storage, publisher, tokens):
        self._profiles = profiles
        self._storage = storage
        self._publisher = publisher
        self._tokens = tokens

    async def _caller_id(self, context):
        token = _bearer_from_metadata(context)
        if token is None:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Not authenticated")
        return auth_res.identity_from_token(token, tokens=self._tokens)["id"]

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "profile.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def UploadResume(self, request, context):
        _grpc_total.labels(method="UploadResume").inc()
        async with (
            log_context(log, "profile.UploadResume"),
            span("profile.UploadResume"),
        ):
            try:
                user_id = await self._caller_id(context)
                out = await profile_res.upload_resume(
                    user_id,
                    request.data,
                    request.content_type,
                    profiles=self._profiles,
                    storage=self._storage,
                    publisher=self._publisher,
                )
                return _profile_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UploadResume")

    async def GetProfile(self, request, context):
        _grpc_total.labels(method="GetProfile").inc()
        async with log_context(log, "profile.GetProfile"), span("profile.GetProfile"):
            try:
                user_id = await self._caller_id(context)
                out = await profile_res.get_profile(user_id, profiles=self._profiles)
                return _profile_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetProfile")

    async def UpdateProfile(self, request, context):
        _grpc_total.labels(method="UpdateProfile").inc()
        async with (
            log_context(log, "profile.UpdateProfile"),
            span("profile.UpdateProfile"),
        ):
            try:
                user_id = await self._caller_id(context)
                out = await profile_res.update_profile(
                    user_id,
                    {
                        "full_name": request.full_name,
                        "age": request.age,
                        "location": request.location,
                        "willing_to_relocate": request.willing_to_relocate,
                        "job_preference": request.job_preference,
                        "experience": [
                            {
                                "company": e.company,
                                "title": e.title,
                                "summary": e.summary,
                            }
                            for e in request.experience
                        ],
                        "education": [
                            {
                                "institution": e.institution,
                                "degree": e.degree,
                                "year": e.year,
                            }
                            for e in request.education
                        ],
                        "skills": list(request.skills),
                    },
                    profiles=self._profiles,
                )
                return _profile_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UpdateProfile")
