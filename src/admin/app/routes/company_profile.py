"""gRPC CompanyProfileService — public (unauthenticated) company-profile read.

Thin adapter over resources/company_profile. GetCompanyProfile needs no auth (the same
public surface as the REST mirror); a company with no published presence is NOT_FOUND.
"""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import company_profile as cp_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import company_profile_pb2, company_profile_pb2_grpc

log = get_logger(component="company_profile.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _profile(d):
    t = d["trust"]
    return company_profile_pb2.CompanyProfile(
        id=d["id"],
        name=d["name"],
        about=d["about"],
        website=d["website"],
        logo=d["logo"],
        locations=d["locations"],
        trust=company_profile_pb2.TrustSignals(
            actively_reviewing=t["actively_reviewing"],
            responds_in_days=t["responds_in_days"],
            open_jobs=t["open_jobs"],
        ),
    )


class CompanyProfileServicer(company_profile_pb2_grpc.CompanyProfileServiceServicer):
    def __init__(
        self, *, companies, profiles, jobs, applications, tokens=None, storage=None
    ):
        self._companies = companies
        self._profiles = profiles
        self._jobs = jobs
        self._applications = applications
        self._tokens = tokens
        self._storage = storage

    async def _abort(self, context, exc, method):
        log.warning(
            "company_profile.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetCompanyProfile(self, request, context):
        _grpc_total.labels(method="GetCompanyProfile").inc()
        async with (
            log_context(
                log, "company_profile.Get", **bind_ids(comp_id=request.comp_id)
            ),
            span("company_profile.Get", comp_id=request.comp_id),
        ):
            out = await cp_res.get_company_profile(
                request.comp_id,
                companies=self._companies,
                profiles=self._profiles,
                jobs=self._jobs,
                applications=self._applications,
                storage=self._storage,
            )
            if out is None:
                await context.abort(grpc.StatusCode.NOT_FOUND, "Company not found")
            return _profile(out)

    async def UpsertCompanyProfile(self, request, context):
        _grpc_total.labels(method="UpsertCompanyProfile").inc()
        async with log_context(log, "company_profile.Upsert"):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await cp_res.upsert_company_profile(
                    identity,
                    {
                        "about": request.about,
                        "website": request.website,
                        "logo": request.logo,
                        "locations": list(request.locations),
                    },
                    profiles=self._profiles,
                    companies=self._companies,
                    jobs=self._jobs,
                    applications=self._applications,
                    storage=self._storage,
                )
                return _profile(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UpsertCompanyProfile")

    async def PresignLogoUpload(self, request, context):
        _grpc_total.labels(method="PresignLogoUpload").inc()
        async with log_context(log, "company_profile.PresignLogo"):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await cp_res.presign_logo_upload(
                    identity, request.content_type, storage=self._storage
                )
                return company_profile_pb2.PresignLogoUploadResponse(
                    upload_url=out["upload_url"], object_key=out["object_key"]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "PresignLogoUpload")
