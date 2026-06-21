"""Cursor pagination tests for application.list_applicants — TDD.

Tests are written to fail until the resource + repo implementations are added.
"""

import pytest
from lib.errors import ValidationError

from app.errors import ForbiddenError
from app.resources import application

_ADMIN = {"id": "u1", "role": "company_admin", "comp_id": "c1"}
_CAND = {"id": "u3", "role": "candidate", "comp_id": ""}


@pytest.fixture
def identity_manager():
    return _ADMIN


@pytest.mark.asyncio
async def test_first_page_returns_total_count(fake_apps_pag, identity_manager):
    """First page (no page_token) must include total_count."""
    await fake_apps_pag.seed_applications(job_id="j1", comp_id="c1", n=30)
    result = await application.list_applicants(
        identity_manager, "j1", 10, "", applications=fake_apps_pag
    )
    assert len(result["applications"]) == 10
    assert result["next_page_token"] != ""
    assert result["total_count"] == 30


@pytest.mark.asyncio
async def test_subsequent_page_omits_total_count(fake_apps_pag, identity_manager):
    """Subsequent pages (non-empty page_token) set total_count to 0."""
    await fake_apps_pag.seed_applications(job_id="j2", comp_id="c1", n=15)
    first = await application.list_applicants(
        identity_manager, "j2", 10, "", applications=fake_apps_pag
    )
    token = first["next_page_token"]
    assert token != ""

    second = await application.list_applicants(
        identity_manager, "j2", 10, token, applications=fake_apps_pag
    )
    assert result["total_count"] == 0 if (result := second) else True
    assert second["total_count"] == 0


@pytest.mark.asyncio
async def test_last_page_returns_empty_next_token(fake_apps_pag, identity_manager):
    """25 apps with page_size 10: page 3 has no next_page_token."""
    await fake_apps_pag.seed_applications(job_id="j3", comp_id="c1", n=25)
    token = ""
    pages = []
    for _ in range(3):
        result = await application.list_applicants(
            identity_manager, "j3", 10, token, applications=fake_apps_pag
        )
        pages.append(result["applications"])
        token = result["next_page_token"]
    assert token == ""
    assert len(pages[0]) == 10
    assert len(pages[1]) == 10
    assert len(pages[2]) == 5


@pytest.mark.asyncio
async def test_page_size_clamps_to_max(fake_apps_pag, identity_manager):
    """page_size=500 is clamped to 200."""
    await fake_apps_pag.seed_applications(job_id="j4", comp_id="c1", n=5)
    result = await application.list_applicants(
        identity_manager, "j4", 500, "", applications=fake_apps_pag
    )
    # Only 5 exist so we get 5; but effective size is 200 (clamped) not 500.
    # Verify the function didn't crash and we got all results under cap.
    assert len(result["applications"]) == 5
    assert result["next_page_token"] == ""


@pytest.mark.asyncio
async def test_page_size_zero_uses_default(fake_apps_pag, identity_manager):
    """page_size=0 uses the server default of 50."""
    await fake_apps_pag.seed_applications(job_id="j5", comp_id="c1", n=60)
    result = await application.list_applicants(
        identity_manager, "j5", 0, "", applications=fake_apps_pag
    )
    # Default 50: returns 50, next token present.
    assert len(result["applications"]) == 50
    assert result["next_page_token"] != ""


@pytest.mark.asyncio
async def test_invalid_cursor_raises_validation_error(fake_apps_pag, identity_manager):
    """A malformed page_token raises ValidationError."""
    with pytest.raises(ValidationError):
        await application.list_applicants(
            identity_manager, "j1", 10, "not-base64!@#", applications=fake_apps_pag
        )


@pytest.mark.asyncio
async def test_cursor_round_trip_navigates_pages(fake_apps_pag, identity_manager):
    """Page cursor chain produces disjoint, ordered application sets."""
    await fake_apps_pag.seed_applications(job_id="j6", comp_id="c1", n=22)
    seen_ids: set[str] = set()
    token = ""
    page_count = 0
    while True:
        result = await application.list_applicants(
            identity_manager, "j6", 10, token, applications=fake_apps_pag
        )
        ids = {a["application_id"] for a in result["applications"]}
        # No overlap with previously seen pages.
        assert ids.isdisjoint(seen_ids), "Duplicate application across pages"
        seen_ids.update(ids)
        page_count += 1
        token = result["next_page_token"]
        if not token:
            break
    assert len(seen_ids) == 22
    assert page_count == 3  # 10 + 10 + 2


@pytest.mark.asyncio
async def test_candidate_cannot_list_applicants(fake_apps_pag):
    """Candidates are forbidden from listing applicants."""
    await fake_apps_pag.seed_applications(job_id="j7", comp_id="c1", n=3)
    with pytest.raises(ForbiddenError):
        await application.list_applicants(
            _CAND, "j7", 10, "", applications=fake_apps_pag
        )
