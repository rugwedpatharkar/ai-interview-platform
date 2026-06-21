"""Candidate profile + resume business logic (transport-agnostic resource functions)."""

from uuid import uuid4

from lib.logging import bind_ids, get_logger, log_context

from app.errors import NotFoundError, ValidationError
from app.model.profile import CandidateProfile

log = get_logger(component="profile.resources")

_ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_JOB_PREFERENCES = {"hybrid", "remote", "onsite"}
# Leading magic bytes per extension: PDF, DOCX (zip). Legacy .doc is NOT accepted — the
# mcp-capability parser only extracts .pdf/.docx, so a .doc would dead-letter unparsed.
_MAGIC = {".pdf": b"%PDF", ".docx": b"PK\x03\x04"}


def _validate_resume(content_type, data):
    if content_type not in _ALLOWED_TYPES:
        raise ValidationError("Unsupported resume type (PDF or DOCX only)")
    if not data or len(data) > _MAX_BYTES:
        raise ValidationError("Resume must be between 1 byte and 10 MB")
    # Sniff the actual bytes so a spoofed Content-Type can't smuggle other content.
    if not data.startswith(_MAGIC[_ALLOWED_TYPES[content_type]]):
        raise ValidationError("Resume content does not match its declared type")


def _to_response(profile):
    return {
        "user_id": profile["user_id"],
        "resume_uploaded": profile.get("resume_uploaded", False),
        "parsed": profile.get("parsed", False),
        "confirmed": profile.get("confirmed", False),
        "completeness": profile.get("completeness", 0),
        "full_name": profile.get("full_name") or "",
        "age": profile.get("age") or 0,
        "location": profile.get("location") or "",
        "willing_to_relocate": profile.get("willing_to_relocate", False),
        "job_preference": profile.get("job_preference") or "",
        # AI-parsed (resume) data the candidate can review/edit.
        "experience": profile.get("experience") or [],
        "education": profile.get("education") or [],
        "skills": profile.get("skills") or [],
    }


async def upload_resume(user_id, data, content_type, *, profiles, storage, publisher):
    async with log_context(
        log, "resource.profile.upload_resume", **bind_ids(user_id=user_id)
    ):
        _validate_resume(content_type, data)
        key = f"{user_id}/{uuid4().hex}{_ALLOWED_TYPES[content_type]}"
        object_key = await storage.put(user_id, "resumes", key, data, content_type)
        fields = {
            "resume_key": object_key,
            "resume_uploaded": True,
            "parsed": False,
            "confirmed": False,
        }
        if await profiles.get_by_user(user_id) is None:
            await profiles.insert(CandidateProfile(user_id=user_id, **fields))
        else:
            await profiles.update_by_user(user_id, fields)
        await publisher.publish(
            "profile.parse", {"user_id": user_id, "resume_key": object_key}
        )
        log.info("resume uploaded + parse queued: user_id={}", user_id)
        return _to_response(await profiles.get_by_user(user_id))


async def get_profile(user_id, *, profiles):
    async with log_context(
        log, "resource.profile.get_profile", **bind_ids(user_id=user_id)
    ):
        profile = await profiles.get_by_user(user_id)
        if profile is None:
            raise NotFoundError("No profile yet")
        return _to_response(profile)


async def update_profile(user_id, fields, *, profiles):
    # Candidate sets the general profile fields (name/age/location/relocation/pref).
    # A full-form replace of those fields; `age == 0` means unset. No official documents
    # — see the data-scope note.
    async with log_context(
        log, "resource.profile.update_profile", **bind_ids(user_id=user_id)
    ):
        if (
            fields.get("job_preference")
            and fields["job_preference"] not in _JOB_PREFERENCES
        ):
            raise ValidationError("job_preference must be hybrid, remote, or onsite")
        if fields.get("age") and not 16 <= fields["age"] <= 100:
            raise ValidationError("age must be between 16 and 100")
        if await profiles.get_by_user(user_id) is None:
            await profiles.insert(CandidateProfile(user_id=user_id, **fields))
        else:
            await profiles.update_by_user(user_id, fields)
        log.info("profile updated: user_id={}", user_id)
        return _to_response(await profiles.get_by_user(user_id))
