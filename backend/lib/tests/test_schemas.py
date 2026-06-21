from lib.schemas import Response, Role


def test_role_values():
    assert {r.value for r in Role} == {
        "company_admin",
        "recruiter",
        "hiring_manager",
        "candidate",
    }


def test_response_defaults():
    r = Response(data={"x": 1})
    assert r.status is True
    assert r.message == "ok"
    assert r.data == {"x": 1}
