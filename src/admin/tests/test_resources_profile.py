import pytest

from app.errors import NotFoundError, ValidationError
from app.resources import profile

PDF = "application/pdf"


@pytest.mark.asyncio
async def test_upload_resume_rejects_content_type_mismatch(fakes):
    # Bytes whose magic doesn't match the declared PDF type are rejected.
    with pytest.raises(ValidationError):
        await profile.upload_resume(
            "u1",
            b"<html>not a pdf</html>",
            PDF,
            profiles=fakes["profiles"],
            storage=fakes["storage"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_upload_resume_stores_and_publishes(fakes):
    out = await profile.upload_resume(
        "u1",
        b"%PDF-1.4 data",
        PDF,
        profiles=fakes["profiles"],
        storage=fakes["storage"],
        publisher=fakes["publisher"],
    )
    assert out["user_id"] == "u1"
    assert out["resume_uploaded"] is True
    assert any(k.startswith("u1/resumes/") for k in fakes["storage"].objects)
    assert fakes["publisher"].published[0][0] == "profile.parse"
    assert fakes["publisher"].published[0][1]["user_id"] == "u1"


@pytest.mark.asyncio
async def test_upload_resume_rejects_bad_type(fakes):
    with pytest.raises(ValidationError):
        await profile.upload_resume(
            "u1",
            b"x",
            "image/png",
            profiles=fakes["profiles"],
            storage=fakes["storage"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_upload_resume_rejects_legacy_doc(fakes):
    # Legacy .doc (valid OLE2 magic) is no longer accepted — the parser only handles
    # .pdf/.docx, so a .doc would dead-letter unparsed. Reject at the boundary.
    with pytest.raises(ValidationError):
        await profile.upload_resume(
            "u1",
            b"\xd0\xcf\x11\xe0doc-bytes",
            "application/msword",
            profiles=fakes["profiles"],
            storage=fakes["storage"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_upload_resume_rejects_too_large(fakes):
    big = b"x" * (10 * 1024 * 1024 + 1)
    with pytest.raises(ValidationError):
        await profile.upload_resume(
            "u1",
            big,
            PDF,
            profiles=fakes["profiles"],
            storage=fakes["storage"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_get_profile_missing_raises(fakes):
    with pytest.raises(NotFoundError):
        await profile.get_profile("nobody", profiles=fakes["profiles"])


@pytest.mark.asyncio
async def test_upload_then_get(fakes):
    await profile.upload_resume(
        "u1",
        b"%PDF",
        PDF,
        profiles=fakes["profiles"],
        storage=fakes["storage"],
        publisher=fakes["publisher"],
    )
    got = await profile.get_profile("u1", profiles=fakes["profiles"])
    assert got["resume_uploaded"] is True


@pytest.mark.asyncio
async def test_update_profile_sets_fields(fakes):
    out = await profile.update_profile(
        "u1",
        {
            "full_name": "Jane Doe",
            "age": 30,
            "location": "Berlin",
            "willing_to_relocate": True,
            "job_preference": "remote",
        },
        profiles=fakes["profiles"],
    )
    assert out["full_name"] == "Jane Doe"
    assert out["age"] == 30
    assert out["location"] == "Berlin"
    assert out["willing_to_relocate"] is True
    assert out["job_preference"] == "remote"


@pytest.mark.asyncio
async def test_update_profile_round_trips_structured_data(fakes):
    out = await profile.update_profile(
        "u1",
        {
            "experience": [
                {"company": "Acme", "title": "Engineer", "summary": "Built X"}
            ],
            "education": [{"institution": "MIT", "degree": "BS", "year": "2020"}],
            "skills": ["python", "go"],
        },
        profiles=fakes["profiles"],
    )
    assert out["experience"] == [
        {"company": "Acme", "title": "Engineer", "summary": "Built X"}
    ]
    assert out["education"] == [{"institution": "MIT", "degree": "BS", "year": "2020"}]
    assert out["skills"] == ["python", "go"]


@pytest.mark.asyncio
async def test_get_profile_defaults_structured_data_to_empty(fakes):
    await profile.update_profile(
        "u1", {"full_name": "Jane"}, profiles=fakes["profiles"]
    )
    got = await profile.get_profile("u1", profiles=fakes["profiles"])
    assert got["experience"] == []
    assert got["education"] == []
    assert got["skills"] == []


@pytest.mark.asyncio
async def test_update_profile_rejects_bad_job_preference(fakes):
    with pytest.raises(ValidationError):
        await profile.update_profile(
            "u1", {"job_preference": "freelance"}, profiles=fakes["profiles"]
        )


@pytest.mark.asyncio
async def test_update_profile_rejects_bad_age(fakes):
    with pytest.raises(ValidationError):
        await profile.update_profile("u1", {"age": 5}, profiles=fakes["profiles"])
