from lib.schemas import Role

from app.model.auth import Company, User


def test_role_values():
    assert {r.value for r in Role} == {"company_admin", "recruiter", "candidate"}


def test_candidate_has_no_comp():
    u = User(email="c@x.com", password_hash="h", role=Role.candidate)
    assert u.comp_id is None
    assert u.email_verified is False


def test_company_defaults_unverified():
    c = Company(name="Acme")
    assert c.verified is False
