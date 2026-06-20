"""Periodic liveness reapers — retention purge + abandoned-aptitude expiry.

These are pure "one pass" functions so they're unit-testable; app/main.py runs them on a
timer. The aptitude reaper publishes `application.expired` for tests a candidate started
but never submitted (the funnel consumer then moves them to `expired`).
"""

from datetime import timedelta

from lib.logging import get_logger

from app.resources.notification import notify_event

log = get_logger(component="scheduler.resources")


async def retention_pass(eraser, *, retention_days, now):
    """Erase candidates whose data is older than the retention window."""
    erased = await eraser.sweep(now - timedelta(days=retention_days))
    if erased:
        log.info("retention pass erased {} candidates", erased)
    return erased


async def aptitude_expiry_pass(
    *, deliveries, applications, publisher, now, max_age_hours
):
    """Expire aptitude tests started but never submitted past `max_age_hours`."""
    cutoff = now - timedelta(hours=max_age_hours)
    expired = 0
    for delivery in await deliveries.list_stale(cutoff):
        application = await applications.get(delivery["application_id"])
        if application is not None and application.get("state") == "aptitude_pending":
            await publisher.publish(
                "application.expired",
                {
                    "application_id": delivery["application_id"],
                    "comp_id": delivery["comp_id"],
                },
            )
            expired += 1
    if expired:
        log.info("aptitude expiry pass expired {} deliveries", expired)
    return expired


async def reconcile_pass(*, applications, attempts, publisher):
    """Re-emit funnel events for applications stranded by a lost publish — the write
    succeeded but the follow-on event's publish failed and the client never retried.

    Today: an application still in `aptitude_pending` that already has a graded attempt
    means its `aptitude.graded` was lost; re-emit it (the funnel CAS dedupes, and once
    the transition lands the application leaves `aptitude_pending`, so this self-stops).
    The per-writer idempotent re-emit covers the retried case; this the never-retried.
    """
    recovered = 0
    for application in await applications.list_by_state("aptitude_pending"):
        attempt = await attempts.get_by_application(str(application["_id"]))
        if attempt is not None:
            await publisher.publish(
                "aptitude.graded",
                {
                    "application_id": str(application["_id"]),
                    "passed": attempt["passed"],
                },
            )
            recovered += 1
    if recovered:
        log.info("reconcile pass re-emitted {} aptitude.graded", recovered)
    return recovered


async def reminder_sweep(*, bookings, notifications, now):
    """Complete past interview bookings + send T-24h / T-1h reminders (each once).

    A booking gets at most one 24h and one 1h reminder; the per-flag CAS stamp
    (`stamp_reminder_if_unset`) makes the sweep idempotent across ticks/replicas.
    Notifications are best-effort. System job — no authz, not user-triggered.
    """
    completed = await bookings.complete_past(before=now)
    sent = 0
    window_end = now + timedelta(hours=24)
    for booking in await bookings.due_reminders(
        window_start=now, window_end=window_end
    ):
        start = booking.get("chosen_start_at")
        if start is None:
            continue
        field = "reminded_1h" if (start - now) <= timedelta(hours=1) else "reminded_24h"
        if booking.get(field):
            continue
        if await bookings.stamp_reminder_if_unset(booking["application_id"], field):
            try:
                await notify_event(
                    booking.get("candidate_user_id", ""),
                    booking.get("comp_id", ""),
                    "interview_reminder",
                    notifications=notifications,
                )
            except Exception:
                log.exception("reminder notify failed")
            sent += 1
    if completed or sent:
        log.info("reminder sweep: completed {}, sent {} reminders", completed, sent)
    return sent
