import pytest

from app.model.interview import CompetencyArea, InterviewBlueprint, JobQuestionPlan
from app.model.profile import CandidateProfile
from app.resources.blueprint import build_blueprint, build_job_question_plan


def _profile():
    return CandidateProfile(headline="Backend Engineer", skills=["python", "asyncio"])


async def test_builds_blueprint(fake_llm):
    canned = InterviewBlueprint(
        competencies=[
            CompetencyArea(name="Concurrency", seed_questions=["explain async"])
        ],
        time_budget_min=30,
    )
    bp = await build_blueprint("JD text", _profile(), llm=fake_llm(canned))
    assert bp.competencies[0].name == "Concurrency"


async def test_rejects_empty_competencies(fake_llm):
    with pytest.raises(ValueError):
        await build_blueprint("JD", _profile(), llm=fake_llm(InterviewBlueprint()))


async def test_rejects_nonpositive_time_budget(fake_llm):
    bad = InterviewBlueprint(competencies=[CompetencyArea(name="X")], time_budget_min=0)
    with pytest.raises(ValueError):
        await build_blueprint("JD", _profile(), llm=fake_llm(bad))


async def test_build_job_question_plan_attaches_citations(fake_llm, fake_capability):
    canned = InterviewBlueprint(
        competencies=[
            CompetencyArea(name="Concurrency", seed_questions=["explain async"])
        ]
    )
    kb = {
        "python": {
            "chunks": ["async chunk"],
            "citations": [{"url": "doc://py", "topic": "python"}],
        }
    }
    cap = fake_capability(kb=kb)
    plan = await build_job_question_plan(
        "JD", ["python"], "comp1", capability=cap, llm=fake_llm(canned)
    )
    assert isinstance(plan, JobQuestionPlan)
    assert plan.competencies[0].name == "Concurrency"
    assert any(c.url == "doc://py" for c in plan.source_citations)
    assert cap.kb_queries == [("python", "python", "comp1", 5)]


async def test_build_blueprint_adapts_cached_plan_without_kb_search(fake_llm):
    adapted = InterviewBlueprint(
        competencies=[CompetencyArea(name="Concurrency", seed_questions=["q"])]
    )
    plan = {
        "competencies": [{"name": "Concurrency", "seed_questions": ["explain async"]}],
        "source_citations": [{"url": "doc://py", "topic": "python"}],
    }
    # build_blueprint takes no `capability`, so the interview path structurally cannot
    # crawl; the cached plan's citations are carried onto the adapted blueprint.
    bp = await build_blueprint(
        "JD", _profile(), llm=fake_llm(adapted), question_plan=plan
    )
    assert bp.competencies[0].name == "Concurrency"
    assert any(c.url == "doc://py" for c in bp.source_citations)
