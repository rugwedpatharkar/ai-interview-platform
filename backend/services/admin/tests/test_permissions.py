import pytest

from app.errors import ForbiddenError
from app.resources.permissions import require_permission


def _identity(role, comp_id="c1"):
    return {"id": "u1", "role": role, "comp_id": comp_id}


def test_require_permission_allows_holder():
    require_permission(_identity("company_admin"), "team:manage")  # no raise


def test_require_permission_denies_non_holder():
    with pytest.raises(ForbiddenError):
        require_permission(_identity("recruiter"), "team:manage")
    with pytest.raises(ForbiddenError):
        require_permission(_identity("candidate"), "analytics:view")
    with pytest.raises(ForbiddenError):
        require_permission(_identity("hiring_manager"), "applicant:decide")
