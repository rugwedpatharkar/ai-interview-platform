"""RabbitMQ worker route: dispatches consumed events to resource handlers.

Thin transport layer — it maps a routing key to a resource handler and delegates all
work. Wired to the lib Consumer in app/main.py. `EVENTS` is the set of routing keys
this service binds (admin emits them).
"""

from lib.logging import bind_ids, get_logger, log_context

from app.resources import handlers

log = get_logger(component="ai_agents.worker")

EVENTS = ["profile.parse", "job.published", "interview.completed", "match.run"]


def make_dispatch(*, llm, data, capability, publisher, scoring_llm=None):
    """Build the `(routing_key, payload)` handler the Consumer invokes per message."""

    async def dispatch(routing_key, payload):
        async with log_context(
            log, "worker.dispatch", **bind_ids(routing_key=routing_key)
        ):
            if routing_key == "profile.parse":
                await handlers.handle_profile_parse(
                    payload,
                    llm=llm,
                    data=data,
                    capability=capability,
                    publisher=publisher,
                )
            elif routing_key == "job.published":
                await handlers.handle_job_published(
                    payload,
                    llm=llm,
                    data=data,
                    capability=capability,
                    publisher=publisher,
                )
            elif routing_key == "interview.completed":
                await handlers.handle_interview_completed(
                    payload,
                    llm=llm,
                    data=data,
                    publisher=publisher,
                    scoring_llm=scoring_llm,
                )
            elif routing_key == "match.run":
                await handlers.handle_match_run(
                    payload,
                    llm=scoring_llm or llm,
                    data=data,
                    capability=capability,
                    publisher=publisher,
                )
            else:
                log.warning("no handler for routing key {}", routing_key)

    return dispatch
