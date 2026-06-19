from app.model.profile import CandidateProfile
from app.model.scoring import MatchRationale
from app.routes.worker import make_dispatch


async def test_dispatch_routes_profile_parse(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data()
    dispatch = make_dispatch(
        llm=fake_llm(CandidateProfile(headline="Eng")),
        data=data,
        capability=fake_capability("resume text"),
        publisher=fake_publisher(),
    )
    await dispatch("profile.parse", {"user_id": "u1", "resume_key": "k"})
    assert "u1" in data.saved_profiles


async def test_dispatch_ignores_unknown_key(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    dispatch = make_dispatch(
        llm=fake_llm(None),
        data=fake_data(),
        capability=fake_capability(),
        publisher=fake_publisher(),
    )
    await dispatch("unknown.key", {})  # must not raise


async def test_dispatch_routes_match_run(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    data = fake_data(
        job={"jd_text": "Python"}, profile={"headline": "Eng", "skills": ["python"]}
    )
    dispatch = make_dispatch(
        llm=fake_llm(MatchRationale(reasons=["fit"])),
        data=data,
        capability=fake_capability(),
        publisher=fake_publisher(),
    )
    await dispatch(
        "match.run", {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"}
    )
    assert len(data.saved_match_results) == 1
