"""Periodic liveness reapers — retention purge + abandoned-aptitude expiry.

These are pure "one pass" functions so they're unit-testable; app/main.py runs them on a
timer. The aptitude reaper publishes `application.expired` for tests a candidate started
but never submitted (the funnel consumer then moves them to `expired`).
"""

from datetime import timedelta

from lib.logging import get_logger

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
