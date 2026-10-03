"""resources/company_profile — public company DTO + funnel-derived trust signals."""

from datetime import UTC, datetime, timedelta

import pytest

from app.errors import ForbiddenError, ValidationError
from app.resources import company_profile as cp

NOW = datetime(2026, 6, 20, tzinfo=UTC)


class _FakeJobs:
    def __init__(self, published=None):
        self._published = published or []

    async def count_published_by_comp(self, comp_id):
        return len([j for j in self._published if j["comp_id"] == comp_id])

    async def list_published_by_comp(self, comp_id, *, skip=0, limit=24):
        rows = [j for j in self._published if j["comp_id"] == comp_id]
        return rows[skip : skip + limit]


class _FakeProfiles:
    def __init__(self, doc=None):
        self._doc = doc

    async def get_by_comp(self, comp_id):
        return self._doc


class _FakeCompanies:
    def __init__(self, names=None):
        self._names = names or {}

    async def names_by_ids(self, comp_ids):
        return {c: self._names[c] for c in comp_ids if c in self._names}


class _FakeApps:
    def __init__(self, rows=None):
        self._rows = rows or []

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r["comp_id"] == comp_id]


def _app(days_to_first, *, comp_id="c1", at=None):
    created = NOW - timedelta(days=days_to_first + 1)
    moved = at or (created + timedelta(days=days_to_first))
    return {
        "comp_id": comp_id,
        "created_at": created,
        "transitions": [{"state": "aptitude_pending", "at": moved}],
    }


@pytest.mark.asyncio
async def test_unknown_company_is_none():
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies(),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([]),
        applications=_FakeApps(),
        now=NOW,
    )
    assert out is None  # no published job + no branding -> 404


@pytest.mark.asyncio
async def test_branding_only_is_public():
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(
            {"about": "We build", "website": "x.io", "locations": ["Berlin"]}
        ),
        jobs=_FakeJobs([]),
        applications=_FakeApps(),
        now=NOW,
    )
    assert out["id"] == "c1" and out["name"] == "Acme"
    assert out["about"] == "We build" and out["website"] == "x.io"
    assert out["locations"] == ["Berlin"]
    assert out["trust"]["open_jobs"] == 0


@pytest.mark.asyncio
async def test_responds_in_days_median_with_enough_samples():
    apps = _FakeApps([_app(2), _app(4), _app(6)])  # median days = 4
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=apps,
        now=NOW,
    )
    assert out["trust"]["responds_in_days"] == 4
    assert out["trust"]["open_jobs"] == 1


@pytest.mark.asyncio
async def test_responds_in_days_zero_below_min_sample():
    apps = _FakeApps([_app(2), _app(4)])  # only 2 < min sample
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=apps,
        now=NOW,
    )
    assert out["trust"]["responds_in_days"] == 0


@pytest.mark.asyncio
async def test_actively_reviewing_only_within_window():
    recent = _app(1, at=NOW - timedelta(days=2))  # moved 2 days ago -> active
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=_FakeApps([recent]),
        now=NOW,
    )
    assert out["trust"]["actively_reviewing"] is True

    old = _app(1, at=NOW - timedelta(days=90))  # moved 90 days ago -> not active
    out2 = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=_FakeApps([old]),
        now=NOW,
    )
    assert out2["trust"]["actively_reviewing"] is False


@pytest.mark.asyncio
async def test_list_company_jobs_maps_cards_and_caps_page_size():
    jobs = _FakeJobs(
        [{"comp_id": "c1", "_id": f"j{i}", "title": f"T{i}"} for i in range(3)]
    )
    out = await cp.list_company_jobs(
        "c1", jobs=jobs, companies=_FakeCompanies({"c1": "Acme"}), page=1, page_size=999
    )
    assert out["page_size"] == 24 and out["total"] == 3
    assert out["jobs"][0]["company_name"] == "Acme"
    assert out["jobs"][0]["company_id"] == "c1"
    assert "comp_id" not in out["jobs"][0]


# --- Branding write (A2): UpsertCompanyProfile + PresignLogoUpload ---

_ADMIN = {"id": "a1", "role": "company_admin", "comp_id": "c1"}
_REC = {"id": "r1", "role": "recruiter", "comp_id": "c1"}


class _MutProfiles:
    def __init__(self, doc=None):
        self.doc = doc

    async def get_by_comp(self, comp_id):
        return self.doc

    async def upsert_branding(self, comp_id, fields):
        self.doc = {**(self.doc or {}), **fields, "comp_id": comp_id}


class _FakeStorage:
    async def presigned_put_url(self, comp_id, category, key, content_type, ttl=None):
        return f"https://put/{comp_id}/{category}/{key}?ct={content_type}"

    async def presigned_get_url(self, comp_id, category, key, ttl=None):
        return f"https://get/{comp_id}/{category}/{key}"


@pytest.mark.asyncio
async def test_upsert_branding_company_admin_only():
    profiles = _MutProfiles()
    jobs = _FakeJobs(published=[{"comp_id": "c1"}])
    out = await cp.upsert_company_profile(
        _ADMIN,
        {"about": "We build", "website": "https://acme.co", "locations": ["NYC"]},
        profiles=profiles,
        companies=_FakeCompanies({"c1": "Acme"}),
        jobs=jobs,
        applications=_FakeApps(),
    )
    assert out["about"] == "We build" and out["website"] == "https://acme.co"
    assert out["locations"] == ["NYC"]
    with pytest.raises(ForbiddenError):  # recruiter lacks branding:edit
        await cp.upsert_company_profile(
            _REC,
            {"about": "x"},
            profiles=profiles,
            companies=_FakeCompanies(),
            jobs=jobs,
            applications=_FakeApps(),
        )


@pytest.mark.asyncio
async def test_upsert_branding_validation():
    kw = {
        "profiles": _MutProfiles(),
        "companies": _FakeCompanies(),
        "jobs": _FakeJobs(published=[{"comp_id": "c1"}]),
        "applications": _FakeApps(),
    }
    with pytest.raises(ValidationError):
        await cp.upsert_company_profile(_ADMIN, {"website": "notaurl"}, **kw)
    with pytest.raises(ValidationError):
        await cp.upsert_company_profile(_ADMIN, {"about": "x" * 5000}, **kw)


@pytest.mark.asyncio
async def test_presign_logo_upload():
    out = await cp.presign_logo_upload(_ADMIN, "image/png", storage=_FakeStorage())
    assert out["upload_url"].startswith("https://put/c1/branding/logo-")
    assert out["object_key"].startswith("logo-") and out["object_key"].endswith(".png")
    with pytest.raises(ValidationError):  # unsupported type
        await cp.presign_logo_upload(_ADMIN, "image/gif", storage=_FakeStorage())
    with pytest.raises(ForbiddenError):  # recruiter denied
        await cp.presign_logo_upload(_REC, "image/png", storage=_FakeStorage())


# Pins BUG-20260728-03 (Medium). presign_logo_upload does not forward a size cap to
# the storage layer, so the returned PUT URL will accept any-size body. The FE-side
# 2 MB check (branding-types.ts) is bypassable with curl. The fix must (a) accept a
# size from the caller and (b) pass it to storage.presigned_put_url as content_length.
class _RecordingStorage:
    def __init__(self):
        self.calls = []

    async def presigned_put_url(
        self, comp_id, category, key, content_type, ttl=None, content_length=None
    ):
        self.calls.append(
            {
                "comp_id": comp_id,
                "category": category,
                "key": key,
                "content_type": content_type,
                "ttl": ttl,
                "content_length": content_length,
            }
        )
        return f"https://put/{comp_id}/{category}/{key}?ct={content_type}"


@pytest.mark.asyncio
@pytest.mark.xfail(
    strict=True,
    reason="pins BUG-20260728-03: presign_logo_upload does not forward "
    "content_length. Remove the xfail when the fix lands so the test guards "
    "the regression.",
)
async def test_presign_logo_upload_binds_content_length_from_caller_size():
    storage = _RecordingStorage()
    # Once the fix lands, the resource must accept a size and forward it to storage
    # as content_length. Today the signature has no size param, so we assert on the
    # storage-side effect: content_length must not be None for any well-formed call.
    await cp.presign_logo_upload(_ADMIN, "image/png", storage=storage)
    assert len(storage.calls) == 1
    assert storage.calls[0]["content_length"] is not None, (
        "presign_logo_upload must bind content_length on the signed PUT to gate size "
        "server-side; today it forwards None so any-size uploads succeed"
    )


@pytest.mark.asyncio
async def test_get_company_profile_presigns_logo_when_stored():
    profiles = _MutProfiles({"comp_id": "c1", "logo": "logo-x.png", "about": "hi"})
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=profiles,
        jobs=_FakeJobs(published=[{"comp_id": "c1"}]),
        applications=_FakeApps(),
        storage=_FakeStorage(),
        now=NOW,
    )
    assert out["logo"] == "https://get/c1/branding/logo-x.png"
