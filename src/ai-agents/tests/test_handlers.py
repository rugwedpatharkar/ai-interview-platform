import pytest

from app.model.aptitude import AptitudeBank, AptitudeQuestion
from app.model.interview import CompetencyArea, InterviewBlueprint
from app.model.profile import CandidateProfile
from app.model.scoring import (
    CompetencyScore,
    Evaluation,
    InterviewReport,
    MatchRationale,
)
from app.resources import handlers


def _bank(n):
    return AptitudeBank(
        questions=[
            AptitudeQuestion(
                question=f"q{i}",
                options=["a", "b", "c", "d"],
                correct_index=0,
                topic="python",
            )
            for i in range(n)
        ]
    )


def _blueprint():
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="Concurrency", seed_questions=["q"])]
    )


async def test_handle_profile_parse(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    profile = CandidateProfile(headline="Engineer", skills=["python"])
    cap = fake_capability("8 years building Python services")
    data = fake_data()
    pub = fake_publisher()
    await handlers.handle_profile_parse(
        {"user_id": "u1", "resume_key": "resumes/u1.pdf"},
        llm=fake_llm(profile),
        data=data,
        capability=cap,
        publisher=pub,
    )
    assert cap.parsed_keys == ["resumes/u1.pdf"]
    assert data.saved_profiles["u1"]["headline"] == "Engineer"
    assert ("profile.parsed", {"user_id": "u1"}) in pub.events


async def test_handle_profile_parse_skips_if_already_parsed(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(profile={"parsed": True})  # already parsed on a prior delivery
    cap = fake_capability("resume text")
    pub = fake_publisher()
    await handlers.handle_profile_parse(
        {"user_id": "u1", "resume_key": "resumes/u1.pdf"},
        llm=fake_llm(None),
        data=data,
        capability=cap,
        publisher=pub,
    )
    assert cap.parsed_keys == []  # document never re-fetched, parse LLM never re-run
    assert data.saved_profiles == {}  # profile not re-saved
    # profile.parsed IS re-emitted so a fan-out lost to a publish failure recovers
    assert ("profile.parsed", {"user_id": "u1"}) in pub.events


async def test_handle_job_published(
    fake_llm_by_schema, fake_capability, fake_data, fake_publisher
):
    data = fake_data(
        job={
            "jd_text": "Backend role",
            "aptitude_config": {"topics": ["python"], "num_questions": 3},
        }
    )
    pub = fake_publisher()
    kb = {
        "python": {
            "chunks": ["c"],
            "citations": [{"url": "doc://py", "topic": "python"}],
        }
    }
    llm = fake_llm_by_schema({AptitudeBank: _bank(3), InterviewBlueprint: _blueprint()})
    await handlers.handle_job_published(
        {"job_id": "j1", "comp_id": "c1"},
        llm=llm,
        data=data,
        capability=fake_capability(kb=kb),
        publisher=pub,
    )
    assert len(data.saved_banks["j1"]["questions"]) == 3
    # The cited question plan is built + persisted alongside the aptitude bank.
    assert data.saved_question_plans["j1"]["competencies"]
    assert ("aptitude.ready", {"job_id": "j1", "comp_id": "c1"}) in pub.events


async def test_handle_job_published_propagates_build_failure(
    fake_capability, fake_data, fake_publisher
):
    """A bank/plan build failure must propagate (→ consumer retries → DLX), not be
    swallowed — else candidates strand at aptitude_pending with no signal. BE-#9."""

    class _RaisingLLM:
        async def structured(self, prompt, schema):
            raise RuntimeError("LLM unavailable")

    data = fake_data(
        job={
            "jd_text": "Backend role",
            "aptitude_config": {"topics": ["python"], "num_questions": 3},
        }
    )
    with pytest.raises(RuntimeError):
        await handlers.handle_job_published(
            {"job_id": "j1", "comp_id": "c1"},
            llm=_RaisingLLM(),
            data=data,
            capability=fake_capability(),
            publisher=fake_publisher(),
        )


async def test_handle_job_published_skips_missing_job(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data()  # no job configured -> get_job returns None
    pub = fake_publisher()
    await handlers.handle_job_published(
        {"job_id": "missing", "comp_id": "c1"},
        llm=fake_llm(_bank(3)),
        data=data,
        capability=fake_capability(),
        publisher=pub,
    )
    assert data.saved_banks == {}
    assert pub.events == []


async def test_handle_job_published_skips_builds_when_fully_built(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(job={"jd_text": "x"})
    data.saved_banks["j1"] = {"questions": []}  # bank already built
    data.saved_question_plans["j1"] = {"competencies": []}  # plan already built
    pub = fake_publisher()
    await handlers.handle_job_published(
        {"job_id": "j1", "comp_id": "c1"},
        llm=fake_llm(None),
        data=data,
        capability=fake_capability(),
        publisher=pub,
    )
    assert data.saved_banks["j1"] == {"questions": []}  # bank NOT regenerated
    # aptitude.ready IS re-emitted (idempotent) so a lost signal can still recover.
    assert ("aptitude.ready", {"job_id": "j1", "comp_id": "c1"}) in pub.events


async def test_handle_job_published_builds_missing_plan_when_bank_exists(
    fake_llm_by_schema, fake_capability, fake_data, fake_publisher
):
    # A prior partial run saved the bank but not the plan; redelivery builds the plan
    # (gated on plan, not bank) so interviews aren't ungrounded forever — without
    # regenerating the bank (which would corrupt an in-flight aptitude delivery).
    data = fake_data(job={"jd_text": "Backend role", "required_topics": ["python"]})
    data.saved_banks["j1"] = {"questions": [1]}  # bank already built
    pub = fake_publisher()
    kb = {
        "python": {
            "chunks": ["c"],
            "citations": [{"url": "doc://py", "topic": "python"}],
        }
    }
    await handlers.handle_job_published(
        {"job_id": "j1", "comp_id": "c1"},
        llm=fake_llm_by_schema({InterviewBlueprint: _blueprint()}),
        data=data,
        capability=fake_capability(kb=kb),
        publisher=pub,
    )
    assert data.saved_banks["j1"] == {"questions": [1]}  # bank NOT regenerated
    assert data.saved_question_plans["j1"]["competencies"]  # missing plan now built
    assert ("aptitude.ready", {"job_id": "j1", "comp_id": "c1"}) in pub.events


async def test_handle_interview_completed(
    fake_llm_by_schema, fake_data, fake_publisher
):
    ctx = {
        "transcript": {"turns": [{"question": "q", "answer": "a"}]},
        "blueprint": {"competencies": [{"name": "python"}]},
        "profile": {"headline": "Engineer"},
        "jd_text": "Backend role",
    }
    data = fake_data(interview_context=ctx)
    pub = fake_publisher()
    evaluation = Evaluation(
        overall_score=0.8,
        recommendation="advance",
        competency_scores=[CompetencyScore(competency="python", score=0.8)],
    )
    report = InterviewReport(executive_summary="Strong")
    llm = fake_llm_by_schema({Evaluation: evaluation, InterviewReport: report})
    await handlers.handle_interview_completed(
        {"application_id": "a1", "comp_id": "c1"}, llm=llm, data=data, publisher=pub
    )
    # Report's recommendation is the Evaluation's authoritative value, carried through.
    assert data.saved_reports["a1"]["recommendation"] == "advance"
    assert (
        "scoring.completed",
        {"application_id": "a1", "comp_id": "c1"},
    ) in pub.events


class _RecordingLLM:
    def __init__(self, response):
        self._response = response
        self.schemas = []

    async def structured(self, prompt, schema):
        self.schemas.append(schema)
        return self._response


async def test_interview_scoring_uses_separate_scoring_llm(fake_data, fake_publisher):
    ctx = {
        "transcript": {"turns": [{"question": "q", "answer": "a"}]},
        "blueprint": {"competencies": [{"name": "python"}]},
        "profile": {"headline": "Engineer"},
        "jd_text": "Backend role",
    }
    data = fake_data(interview_context=ctx)
    pub = fake_publisher()
    scoring = _RecordingLLM(
        Evaluation(
            overall_score=0.8,
            recommendation="advance",
            competency_scores=[CompetencyScore(competency="python", score=0.8)],
        )
    )
    creative = _RecordingLLM(InterviewReport(executive_summary="Strong"))
    await handlers.handle_interview_completed(
        {"application_id": "a1", "comp_id": "c1"},
        llm=creative,
        scoring_llm=scoring,
        data=data,
        publisher=pub,
    )
    assert Evaluation in scoring.schemas  # evaluator used the deterministic scoring LLM
    assert InterviewReport in creative.schemas  # report-writer used the creative LLM
    assert data.saved_reports["a1"]["recommendation"] == "advance"


async def test_handle_interview_completed_skips_if_already_scored(
    fake_llm, fake_data, fake_publisher
):
    data = fake_data(interview_context=None)
    data.saved_reports["a1"] = {"recommendation": "advance"}  # already scored
    pub = fake_publisher()
    await handlers.handle_interview_completed(
        {"application_id": "a1", "comp_id": "c1"},
        llm=fake_llm(None),
        data=data,
        publisher=pub,
    )
    # scoring.completed IS re-emitted so a funnel advance lost to an earlier publish
    # failure recovers; the report is NOT re-run or overwritten (funnel CAS dedupes).
    assert (
        "scoring.completed",
        {"application_id": "a1", "comp_id": "c1"},
    ) in pub.events
    assert data.saved_reports["a1"]["recommendation"] == "advance"  # not overwritten


async def test_handle_interview_completed_skips_missing_context(
    fake_llm, fake_data, fake_publisher
):
    data = fake_data()  # interview_context defaults to None
    pub = fake_publisher()
    await handlers.handle_interview_completed(
        {"application_id": "missing", "comp_id": "c1"},
        llm=fake_llm(None),
        data=data,
        publisher=pub,
    )
    assert data.saved_reports == {}
    assert pub.events == []


async def test_handle_match_run_scores_and_emits_once(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(
        job={"jd_text": "Python backend"},
        profile={"headline": "Eng", "skills": ["python"]},
    )
    pub = fake_publisher()
    await handlers.handle_match_run(
        {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"},
        llm=fake_llm(MatchRationale(reasons=["Good Python fit"])),
        data=data,
        capability=fake_capability(),
        publisher=pub,
    )
    assert len(data.saved_match_results) == 1
    assert data.saved_match_results[0][:3] == ("c1", "j1", "u1")
    assert (
        "match.completed",
        {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"},
    ) in pub.events


async def test_handle_match_run_is_idempotent(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(job={"jd_text": "x"}, profile={"headline": "Eng"})
    pub = fake_publisher()
    payload = {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"}
    for _ in range(2):
        await handlers.handle_match_run(
            payload,
            llm=fake_llm(MatchRationale(reasons=[])),
            data=data,
            capability=fake_capability(),
            publisher=pub,
        )
    assert len(data.saved_match_results) == 1  # redelivery skipped
    assert len(pub.events) == 1


async def test_handle_match_run_skips_missing_profile(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(job={"jd_text": "x"})  # no profile configured
    pub = fake_publisher()
    await handlers.handle_match_run(
        {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"},
        llm=fake_llm(MatchRationale(reasons=[])),
        data=data,
        capability=fake_capability(),
        publisher=pub,
    )
    assert data.saved_match_results == []
    assert pub.events == []


class _RacedData:
    """Concurrent racer: the skip-guard sees no result, but the save loses the
    unique-index race (returns False), so match.completed must NOT publish."""

    def __init__(self, job, profile):
        self._job = job
        self._profile = profile

    async def get_match_results(self, job_id=None, candidate_user_id=None):
        return []

    async def get_job(self, job_id):
        return self._job

    async def get_profile(self, user_id):
        return self._profile

    async def save_match_result(self, *args):
        return False


async def test_handle_match_run_no_publish_when_save_loses_race(
    fake_llm, fake_capability, fake_publisher
):
    pub = fake_publisher()
    await handlers.handle_match_run(
        {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"},
        llm=fake_llm(MatchRationale(reasons=[])),
        data=_RacedData({"jd_text": "x"}, {"headline": "Eng"}),
        capability=fake_capability(),
        publisher=pub,
    )
    assert pub.events == []  # lost the race -> no match.completed
