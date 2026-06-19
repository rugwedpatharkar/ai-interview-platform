import pytest

from app.model.profile import CandidateProfile, ExperienceItem
from app.resources.profile_parser import parse_profile


async def test_parses_structured_profile(fake_llm):
    canned = CandidateProfile(
        headline="Senior Backend Engineer",
        skills=["python", "asyncio"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
        years_experience=6.0,
    )
    profile = await parse_profile(
        "8 years building Python services", llm=fake_llm(canned)
    )
    assert profile.headline == "Senior Backend Engineer"
    assert "python" in profile.skills
    assert profile.experience[0].company == "Acme"


async def test_rejects_empty_resume(fake_llm):
    with pytest.raises(ValueError):
        await parse_profile("   ", llm=fake_llm(CandidateProfile()))
