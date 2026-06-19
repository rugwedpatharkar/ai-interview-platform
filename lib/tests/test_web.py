from lib.web import cors_config


def test_wildcard_drops_credentials():
    # *+credentials would make Starlette reflect ANY origin with creds — refuse it.
    assert cors_config(["*"]) == {"allow_origins": ["*"], "allow_credentials": False}


def test_empty_drops_credentials():
    assert cors_config([]) == {"allow_origins": ["*"], "allow_credentials": False}


def test_explicit_list_keeps_credentials():
    cfg = cors_config(["http://localhost:3000", "http://localhost:3001"])
    assert cfg["allow_credentials"] is True
    assert cfg["allow_origins"] == ["http://localhost:3000", "http://localhost:3001"]
