"""Event orchestration: wire funnel events to the agents + gateways.

Each handler fetches its inputs (via the capability/data gateways), runs the relevant
agent, persists the result, and emits the follow-on event. Pure orchestration — the LLM
reasoning lives in the per-agent resource modules. Required payload keys are accessed
directly: a malformed event raises and the Consumer dead-letters it (never silently
dropped).
"""

from lib.logging import get_logger

from app.model.interview import InterviewBlueprint, Transcript
from app.model.profile import CandidateProfile
from app.resources.aptitude_setter import build_aptitude_bank
from app.resources.blueprint import build_job_question_plan
from app.resources.evaluator import evaluate_interview
from app.resources.matcher import match
from app.resources.profile_parser import parse_profile
from app.resources.report_writer import write_report

log = get_logger(component="agent.handlers")

_DEFAULT_APTITUDE_QUESTIONS = 10


async def handle_profile_parse(payload, *, llm, data, capability, publisher):
    """profile.parse {user_id, resume_key}: resume document -> structured profile."""
    user_id = payload["user_id"]
    # Idempotency: a redelivered profile.parse must not re-fetch the document or re-run
    # the parse LLM; the saved profile's `parsed` flag means it is already done.
    existing = await data.get_profile(user_id)
    if existing and existing.get("parsed"):
        # Already parsed on a prior delivery: skip the re-fetch + parse LLM, but re-emit
        # profile.parsed so a fan-out lost to an earlier publish failure still recovers
        # (the match fan-out is deduped by the unique (job, candidate) index).
        log.info("profile.parse: {} already parsed, re-emitting", user_id)
        await publisher.publish("profile.parsed", {"user_id": user_id})
        return
    resume_text = await capability.parse_document(payload["resume_key"], owner=user_id)
    profile = await parse_profile(resume_text, llm=llm)
    await data.save_profile(user_id, profile.model_dump())
    await publisher.publish("profile.parsed", {"user_id": user_id})
    log.info("profile.parse handled for user {}", user_id)


async def handle_job_published(payload, *, llm, data, capability, publisher):
    """job.published {job_id, comp_id}: build the aptitude bank + cited question plan.

    Field names mirror admin's Job model: `jd_text` plus a nested `aptitude_config`
    {topics, num_questions}, with `required_topics` as the topic fallback. The plan is
    built once here so the interview only loads it later, never crawls.
    """
    job_id = payload["job_id"]
    job = await data.get_job(job_id)
    if job is None:
        log.warning("job.published: job {} not found, skipping", job_id)
        return
    aptitude = job.get("aptitude_config", {})
    topics = aptitude.get("topics") or job.get("required_topics", [])
    # Bank + plan are gated independently. A redelivery must not regenerate an existing
    # bank (a fresh question set corrupts an in-flight delivery's answer order), but it
    # MUST build a plan a prior partial run never saved (bank saved, then plan build
    # failed) — else every interview for this job stays ungrounded forever.
    if await data.get_aptitude_bank(job_id) is None:
        bank = await build_aptitude_bank(
            job["jd_text"],
            topics,
            aptitude.get("num_questions", _DEFAULT_APTITUDE_QUESTIONS),
            llm=llm,
        )
        await data.save_aptitude_bank(job_id, bank.model_dump())
    if await data.get_question_plan(job_id) is None:
        plan = await build_job_question_plan(
            job["jd_text"], topics, payload["comp_id"], capability=capability, llm=llm
        )
        plan.job_id = job_id
        await data.save_question_plan(job_id, plan.model_dump())
    # aptitude.ready is informational (no consumer yet); re-emitting it every delivery
    # keeps the emit idempotent + independent of the save (a future consumer recovers a
    # signal lost to a publish failure). Wiring it to a recruiter notification is a
    # documented product follow-up.
    await publisher.publish(
        "aptitude.ready", {"job_id": job_id, "comp_id": payload["comp_id"]}
    )
    log.info("job.published handled for job {}", job_id)


async def handle_interview_completed(
    payload, *, llm, data, publisher, scoring_llm=None
):
    """interview.completed: score the transcript, write the report, signal the funnel.

    Both admin (funnel state) and this service consume interview.completed via separate
    queues; this handler runs Evaluator -> Report-Writer and emits scoring.completed.
    """
    application_id = payload["application_id"]
    # Idempotency: at-least-once redelivery (or a re-emit) must not re-run the LLM chain
    # or overwrite an existing report — skip if this application is already scored.
    if await data.get_report(application_id) is not None:
        # Already scored on a prior delivery: skip the LLM chain + report overwrite, but
        # re-emit scoring.completed so a funnel advance lost to a publish failure still
        # recovers (the funnel CAS makes a duplicate scoring.completed a no-op).
        log.info("interview.completed: {} already scored, re-emitting", application_id)
        await publisher.publish(
            "scoring.completed",
            {"application_id": application_id, "comp_id": payload["comp_id"]},
        )
        return
    ctx = await data.get_interview_context(application_id)
    if ctx is None:
        log.warning("interview.completed: no context for {}, skipping", application_id)
        return
    blueprint = InterviewBlueprint(**ctx["blueprint"])
    transcript = Transcript(**ctx["transcript"])
    profile = CandidateProfile(**ctx["profile"])
    competencies = [c.name for c in blueprint.competencies]
    # The evaluator runs on a deterministic (temp-0) LLM for auditable, fair scoring;
    # the creative report-writer keeps the default LLM.
    evaluation = await evaluate_interview(
        transcript, competencies, ctx["jd_text"], llm=scoring_llm or llm
    )
    report = await write_report(evaluation, profile, llm=llm)
    await data.save_report(application_id, report.model_dump())
    await publisher.publish(
        "scoring.completed",
        {"application_id": application_id, "comp_id": payload["comp_id"]},
    )
    log.info(
        "interview.completed scored: {} -> {}", application_id, report.recommendation
    )


async def handle_match_run(payload, *, llm, data, capability, publisher):
    """match.run {comp_id, job_id, candidate_user_id}: score candidate<->job fit.

    Idempotent: a result already on file for this (job, candidate) short-circuits, so an
    at-least-once redelivery never re-runs the LLM or re-emits match.completed.
    """
    comp_id = payload["comp_id"]
    job_id = payload["job_id"]
    candidate_user_id = payload["candidate_user_id"]
    if await data.get_match_results(job_id=job_id, candidate_user_id=candidate_user_id):
        log.info("match.run: {}/{} already scored, skipping", job_id, candidate_user_id)
        return
    job = await data.get_job(job_id)
    profile_doc = await data.get_profile(candidate_user_id)
    if job is None or profile_doc is None:
        log.warning(
            "match.run: missing job/profile for {}/{}, skipping",
            job_id,
            candidate_user_id,
        )
        return
    result = await match(
        CandidateProfile(**profile_doc), job["jd_text"], embedder=capability, llm=llm
    )
    inserted = await data.save_match_result(
        comp_id, job_id, candidate_user_id, result.score, result.reasons
    )
    # Publish exactly once: only the first writer (per the unique index) emits.
    if inserted:
        await publisher.publish(
            "match.completed",
            {
                "comp_id": comp_id,
                "job_id": job_id,
                "candidate_user_id": candidate_user_id,
            },
        )
    log.info(
        "match.run scored {}/{} -> {:.4f}", job_id, candidate_user_id, result.score
    )
