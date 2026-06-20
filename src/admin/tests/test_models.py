import pytest
from lib.schemas import Role
from pydantic import ValidationError

from app.model.auth import Company, User
from app.model.job import Job
from app.model.profile import CandidateProfile


def test_role_values():
    assert {r.value for r in Role} == {
        "company_admin",
        "recruiter",
        "hiring_manager",
        "candidate",
    }


def test_candidate_has_no_comp():
    u = User(email="c@x.com", password_hash="h", role=Role.candidate)
    assert u.comp_id is None
    assert u.email_verified is False


def test_company_defaults_unverified():
    c = Company(name="Acme")
    assert c.verified is False


def test_job_title_too_long_raises():
    with pytest.raises(ValidationError):
        Job(comp_id="c1", title="x" * 201)


def test_job_jd_text_too_long_raises():
    with pytest.raises(ValidationError):
        Job(comp_id="c1", title="Eng", jd_text="x" * 50_001)


def test_job_valid_at_boundary():
    j = Job(comp_id="c1", title="x" * 200, jd_text="x" * 50_000)
    assert len(j.title) == 200
    assert len(j.jd_text) == 50_000


def test_profile_skills_too_many_raises():
    with pytest.raises(ValidationError):
        CandidateProfile(user_id="u1", skills=["s"] * 101)


def test_profile_experience_too_many_raises():
    with pytest.raises(ValidationError):
        CandidateProfile(user_id="u1", experience=[{}] * 51)


def test_profile_education_too_many_raises():
    with pytest.raises(ValidationError):
        CandidateProfile(user_id="u1", education=[{}] * 51)


def test_profile_valid_at_boundary():
    p = CandidateProfile(
        user_id="u1",
        skills=["s"] * 100,
        experience=[{}] * 50,
        education=[{}] * 50,
    )
    assert len(p.skills) == 100
    assert len(p.experience) == 50
    assert len(p.education) == 50
