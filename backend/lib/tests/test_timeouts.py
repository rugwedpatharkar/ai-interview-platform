from lib.config import BaseServiceSettings

from lib import timeouts


def test_timeout_accessors_read_from_settings(monkeypatch):
    monkeypatch.setenv("MONGO_OP_TIMEOUT_SECONDS", "7.5")
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "3")
    monkeypatch.setenv("LLM_CALL_RETRY_ATTEMPTS", "5")
    monkeypatch.setenv("RABBITMQ_PUBLISH_TIMEOUT_SECONDS", "4")
    monkeypatch.setenv("LLM_CALL_TIMEOUT_SECONDS", "20")
    monkeypatch.setenv("MCP_CALL_TIMEOUT_SECONDS", "15")
    monkeypatch.setenv("STORAGE_OP_TIMEOUT_SECONDS", "25")
    monkeypatch.setenv("HTTP_CLIENT_TIMEOUT_SECONDS", "12")

    s = BaseServiceSettings()
    timeouts._fallback = (
        s  # inject for the test (no service provider is registered here)
    )
    try:
        assert timeouts.mongo() == 7.5
        assert timeouts.redis() == 3.0
        assert timeouts.rabbitmq_publish() == 4.0
        assert timeouts.llm_call() == 20.0
        assert timeouts.llm_retries() == 5
        assert timeouts.mcp_call() == 15.0
        assert timeouts.storage_op() == 25.0
        assert timeouts.http_client() == 12.0
    finally:
        timeouts.reset_for_test()


def test_defaults_match_spec_section_2_3(monkeypatch):
    for var in (
        "MONGO_OP_TIMEOUT_SECONDS",
        "REDIS_OP_TIMEOUT_SECONDS",
        "RABBITMQ_PUBLISH_TIMEOUT_SECONDS",
        "LLM_CALL_TIMEOUT_SECONDS",
        "LLM_CALL_RETRY_ATTEMPTS",
        "MCP_CALL_TIMEOUT_SECONDS",
        "STORAGE_OP_TIMEOUT_SECONDS",
        "HTTP_CLIENT_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(var, raising=False)
    s = BaseServiceSettings()
    timeouts._fallback = s
    try:
        assert timeouts.mongo() == 10.0
        assert timeouts.redis() == 5.0
        assert timeouts.rabbitmq_publish() == 5.0
        assert timeouts.llm_call() == 30.0
        assert timeouts.llm_retries() == 3
        assert timeouts.mcp_call() == 20.0
        assert timeouts.storage_op() == 35.0
        assert timeouts.http_client() == 15.0
    finally:
        timeouts.reset_for_test()
