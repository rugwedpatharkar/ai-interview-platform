from lib.schemas import Role
from lib.schemas.permissions import PERMISSIONS, has_permission


def test_company_admin_holds_all_scopes_superset():
    assert has_permission("company_admin", "team:manage")
    assert len(PERMISSIONS[Role.company_admin]) == 8
    # Admin is a strict superset of both other company roles.
    assert PERMISSIONS[Role.company_admin] >= PERMISSIONS[Role.recruiter]
    assert PERMISSIONS[Role.company_admin] >= PERMISSIONS[Role.hiring_manager]


def test_recruiter_lacks_team_and_branding():
    assert has_permission("recruiter", "job:post")
    assert has_permission("recruiter", "applicant:decide")
    assert not has_permission("recruiter", "team:manage")
    assert not has_permission("recruiter", "branding:edit")


def test_hiring_manager_read_comms_subset_only():
    assert has_permission("hiring_manager", "applicant:review")
    assert has_permission("hiring_manager", "messaging:send")
    assert has_permission("hiring_manager", "analytics:view")
    assert not has_permission("hiring_manager", "applicant:decide")
    assert not has_permission("hiring_manager", "job:post")


def test_unknown_role_or_scope_is_false():
    assert not has_permission("candidate", "analytics:view")
    assert not has_permission("nonsense", "team:manage")
    assert not has_permission("company_admin", "bogus:scope")
