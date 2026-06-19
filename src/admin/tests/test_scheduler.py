from datetime import UTC, datetime, timedelta

import pytest

from app.model.application import Application
from app.model.aptitude import AptitudeDelivery
from app.resources import scheduler


class _StubEraser:
    def __init__(self):
        self.cutoff = None

    async def sweep(self, cutoff):
        self.cutoff = cutoff
        return 0


@pytest.mark.asyncio
async def test_retention_pass_uses_cutoff():
    eraser = _StubEraser()
    now = datetime(2026, 1, 1, tzinfo=UTC)
    await scheduler.retention_pass(eraser, retention_days=30, now=now)
    assert eraser.cutoff == now - timedelta(days=30)


@pytest.mark.asyncio
async def test_aptitude_expiry_publishes_for_stale_pending(fakes):
    now = datetime(2026, 6, 1, tzinfo=UTC)
    aid = await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="u1", state="aptitude_pending"
        )
    )
    await fakes["deliveries"].insert(
        AptitudeDelivery(
            application_id=aid,
            comp_id="c1",
            job_id="j1",
            order=[0],
            delivered_at=datetime(2026, 5, 1, tzinfo=UTC),  # ~31 days ago
        )
    )
    pub = fakes["publisher"]
    n = await scheduler.aptitude_expiry_pass(
        deliveries=fakes["deliveries"],
        applications=fakes["applications"],
        publisher=pub,
        now=now,
        max_age_hours=24,
    )
    assert n == 1
    assert (
        "application.expired",
        {"application_id": aid, "comp_id": "c1"},
    ) in pub.published


@pytest.mark.asyncio
async def test_aptitude_expiry_skips_non_pending(fakes):
    now = datetime(2026, 6, 1, tzinfo=UTC)
    aid = await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="u1", state="interviewed"
        )
    )
    await fakes["deliveries"].insert(
        AptitudeDelivery(
            application_id=aid,
            comp_id="c1",
            job_id="j1",
            order=[0],
            delivered_at=datetime(2026, 5, 1, tzinfo=UTC),
        )
    )
    n = await scheduler.aptitude_expiry_pass(
        deliveries=fakes["deliveries"],
        applications=fakes["applications"],
        publisher=fakes["publisher"],
        now=now,
        max_age_hours=24,
    )
    assert n == 0
