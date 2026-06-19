"""Blueprint agent: two-tier, RAG-grounded interview planning.

Tier 1 (`build_job_question_plan`) runs once on job.published: it pulls per-topic
reference material from the KB (`capability.kb_search`) and grounds a cited, job-level
question plan. Tier 2 (`build_blueprint`) runs at interview start: it loads that cached
plan and adapts it to the candidate. `build_blueprint` takes no capability gateway, so
the interview hot path cannot crawl — it only ever reads the prepared plan.
"""

from lib.logging import get_logger

from app.model.interview import InterviewBlueprint, JobQuestionPlan, SourceCitation
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.blueprint")


def _prompt(jd_text, profile, time_budget_min):
    skills = ", ".join(profile.skills)
    return (
        "Design a focused technical interview plan for this candidate and role. Choose "
        "the competencies that best separate a strong hire from a weak one, ordered "
        "most important first, each with a short 'why' and 2-3 seed questions tailored "
        f"to the candidate's background. Keep it within {time_budget_min} minutes.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Candidate headline: {fence('headline', profile.headline)}\n"
        f"Candidate skills: {fence('skills', skills)}\n\n"
        f"Job description:\n{fence('jd', jd_text)}"
    )


def _plan_prompt(jd_text, grounding):
    blocks = "\n\n".join(
        f"Topic {fence('topic', topic)} reference material:\n"
        f"{fence('kb', ' '.join(chunks))}"
        for topic, chunks in grounding
    )
    return (
        "Design a job-level technical interview plan. For each key competency give a "
        "short 'why' and 2-3 seed questions grounded in the reference material below — "
        "prefer questions the material supports.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Job description:\n{fence('jd', jd_text)}\n\n"
        f"{blocks}"
    )


def _adapt_prompt(jd_text, profile, plan_competencies, time_budget_min):
    skills = ", ".join(profile.skills)
    seeds = "\n".join(
        f"- {c['name']}: {'; '.join(c.get('seed_questions', []))}"
        for c in plan_competencies
    )
    return (
        "Adapt this prepared job interview plan to the specific candidate. Keep the "
        "grounded competencies and seed questions, tailoring emphasis and wording to "
        f"the candidate's background. Keep it within {time_budget_min} minutes.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Candidate headline: {fence('headline', profile.headline)}\n"
        f"Candidate skills: {fence('skills', skills)}\n\n"
        f"Job description:\n{fence('jd', jd_text)}\n\n"
        f"Prepared plan:\n{fence('plan', seeds)}"
    )


# Cap the LLM-chosen budget so a pathological value can't strand an interview past its
# Redis session TTL (which tracks this budget) or create a multi-day key. 3h is well
# beyond any real interview.
_MAX_BUDGET_MIN = 180


def _validate(blueprint):
    if not blueprint.competencies:
        raise ValueError("blueprint has no competencies")
    if blueprint.time_budget_min <= 0:
        raise ValueError("blueprint time budget must be positive")
    blueprint.time_budget_min = min(blueprint.time_budget_min, _MAX_BUDGET_MIN)


async def build_job_question_plan(
    jd_text, topics, owner, *, capability, llm
) -> JobQuestionPlan:
    citations, grounding = [], []
    for topic in topics:
        result = await capability.kb_search(topic, topic, owner)
        citations.extend(SourceCitation(**c) for c in result.get("citations", []))
        grounding.append((topic, result.get("chunks", [])))
    plan = await llm.structured(_plan_prompt(jd_text, grounding), InterviewBlueprint)
    log.info(
        "job question plan built: {} competencies, {} citations",
        len(plan.competencies),
        len(citations),
    )
    return JobQuestionPlan(competencies=plan.competencies, source_citations=citations)


async def build_blueprint(
    jd_text, profile, *, llm, question_plan=None, time_budget_min=30
) -> InterviewBlueprint:
    if question_plan:
        prompt = _adapt_prompt(
            jd_text, profile, question_plan.get("competencies", []), time_budget_min
        )
    else:
        prompt = _prompt(jd_text, profile, time_budget_min)
    blueprint = await llm.structured(prompt, InterviewBlueprint)
    _validate(blueprint)
    if question_plan:
        blueprint.source_citations = [
            SourceCitation(**c) for c in question_plan.get("source_citations", [])
        ]
    log.info("blueprint built: {} competencies", len(blueprint.competencies))
    return blueprint
