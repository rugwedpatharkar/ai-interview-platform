from datetime import UTC, datetime, timedelta

import pytest

from app.model.application import Application
from app.model.aptitude import AptitudeAttempt, AptitudeDelivery
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


@pytest.mark.asyncio
async def test_reconcile_reemits_stranded_aptitude(fakes):
    # Graded but still aptitude_pending = a lost aptitude.graded publish. Re-emit it.
    stranded = await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="u1", state="aptitude_pending"
        )
    )
    await fakes["attempts"].insert(
        AptitudeAttempt(
            application_id=stranded,
            comp_id="c1",
            candidate_user_id="u1",
            job_id="j1",
            score=80,
            passed=True,
        )
    )
    # Started-but-ungraded (no attempt) → not stranded, must NOT be re-emitted.
    await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="u2", state="aptitude_pending"
        )
    )
    pub = fakes["publisher"]
    n = await scheduler.reconcile_pass(
        applications=fakes["applications"], attempts=fakes["attempts"], publisher=pub
    )
    assert n == 1
    assert (
        "aptitude.graded",
        {"application_id": stranded, "passed": True},
    ) in pub.published
    assert len(pub.published) == 1
