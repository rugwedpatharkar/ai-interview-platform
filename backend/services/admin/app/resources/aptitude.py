"""Aptitude delivery + grading (transport-agnostic resources).

The candidate fetches the test (questions only — never the answer key), submits answers,
and is graded against the answer key + the job's pass threshold. Grading is the single
place `aptitude.graded` is emitted, which drives the funnel gate. The bank is produced
upstream by the ai-agents Aptitude-Setter (collection `aptitude_banks`).

The test is **timed, single-attempt, and randomized**: fetching records an
`AptitudeDelivery` (a per-candidate question permutation + a clock-start) so re-fetches
are stable; submitting enforces the job's time limit, maps the candidate's positional
answers back through the permutation, and the unique attempt index makes a second
submission a clean conflict.
"""

import random
from datetime import UTC, datetime

from lib.logging import bind_ids, get_logger, log_context
from pymongo.errors import DuplicateKeyError

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.model.aptitude import AptitudeAttempt, AptitudeDelivery

log = get_logger(component="aptitude.resources")

_DEFAULT_PASS_THRESHOLD = 60
_DEFAULT_TIME_LIMIT_MIN = 20


def _utcnow():
    return datetime.now(UTC)


def _random_order(n):
    return random.sample(range(n), n)


async def _owned(identity, application_id, applications):
    application = await applications.get(application_id)
    if application is None:
        raise NotFoundError("Application not found")
    if application["candidate_user_id"] != identity["id"]:
        raise ForbiddenError("Not your application")
    return application


async def get_aptitude_test(
    identity,
    application_id,
    *,
    applications,
    banks,
    deliveries,
    permute=_random_order,
    clock=_utcnow,
):
    async with log_context(
        log,
        "resource.aptitude.get_aptitude_test",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        application = await _owned(identity, application_id, applications)
        bank = await banks.get_by_job(application["job_id"])
        if bank is None or not bank["questions"]:
            raise NotFoundError("Aptitude test not ready")
        questions = bank["questions"]
        delivery = await deliveries.get_by_application(application_id)
        if delivery is None:
            order = permute(len(questions))
            await deliveries.insert(
                AptitudeDelivery(
                    application_id=application_id,
                    comp_id=application["comp_id"],
                    job_id=application["job_id"],
                    order=order,
                    delivered_at=clock(),
                )
            )
        else:
            order = delivery["order"]
        return {
            "application_id": application_id,
            "questions": [
                {
                    "index": pos,
                    "question": questions[orig]["question"],
                    "options": questions[orig]["options"],
                    "topic": questions[orig]["topic"],
                }
                for pos, orig in enumerate(order)
            ],
        }


async def grade_aptitude(
    identity,
    application_id,
    answers,
    *,
    applications,
    jobs,
    banks,
    attempts,
    deliveries,
    publisher,
    clock=_utcnow,
):
    async with log_context(
        log,
        "resource.aptitude.grade_aptitude",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        application = await _owned(identity, application_id, applications)
        if application["state"] != "aptitude_pending":
            raise ValidationError("Aptitude is not open for this application")
        delivery = await deliveries.get_by_application(application_id)
        if delivery is None:
            raise ValidationError("Aptitude test was not started")
        bank = await banks.get_by_job(application["job_id"])
        if bank is None or not bank["questions"]:
            raise NotFoundError("Aptitude test not ready")
        questions = bank["questions"]
        order = delivery["order"]
        if len(answers) != len(order):
            raise ValidationError("Answer count does not match the test")
        config = (await jobs.get_by_id(application["job_id"]) or {}).get(
            "aptitude_config", {}
        )
        limit_seconds = config.get("time_limit_min", _DEFAULT_TIME_LIMIT_MIN) * 60
        if (clock() - delivery["delivered_at"]).total_seconds() > limit_seconds:
            raise ValidationError("Aptitude time limit exceeded")
        # Answers are positional in *served* order; map each back to its original
        # question. Each must index a real option: reject out-of-range, don't silently
        # score wrong.
        for pos, ans in enumerate(answers):
            if not 0 <= ans < len(questions[order[pos]]["options"]):
                raise ValidationError("Answer out of range for a question")
        correct = sum(
            1
            for pos, ans in enumerate(answers)
            if ans == questions[order[pos]]["correct_index"]
        )
        score = round(100 * correct / len(order))
        passed = score >= config.get("pass_threshold", _DEFAULT_PASS_THRESHOLD)
        try:
            await attempts.insert(
                AptitudeAttempt(
                    application_id=application_id,
                    comp_id=application["comp_id"],
                    candidate_user_id=identity["id"],
                    job_id=application["job_id"],
                    score=score,
                    passed=passed,
                )
            )
        except DuplicateKeyError:
            # Already graded on a prior submit. Re-emit the funnel event (the first
            # submit's publish may have failed, stranding the application) and return
            # the RECORDED result — single-attempt, so the retry never re-grades. The
            # funnel CAS dedupes a duplicate aptitude.graded, so re-emitting is safe.
            existing = await attempts.get_by_application(application_id)
            await publisher.publish(
                "aptitude.graded",
                {"application_id": application_id, "passed": existing["passed"]},
            )
            return {
                "application_id": application_id,
                "score": existing["score"],
                "passed": existing["passed"],
            }
        await publisher.publish(
            "aptitude.graded", {"application_id": application_id, "passed": passed}
        )
        log.info(
            "aptitude graded: app={} score={} passed={}", application_id, score, passed
        )
        return {"application_id": application_id, "score": score, "passed": passed}
