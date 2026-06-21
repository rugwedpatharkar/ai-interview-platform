import pytest

from app.errors import LLMError
from app.infra.gemini import _with_retry


async def test_with_retry_succeeds_after_transient_failures():
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient")
        return "ok"

    out = await _with_retry(flaky, attempts=3, base_delay=0)
    assert out == "ok"
    assert calls["n"] == 3


async def test_with_retry_raises_llm_error_after_exhaustion():
    async def always_fails():
        raise RuntimeError("boom")

    with pytest.raises(LLMError):
        await _with_retry(always_fails, attempts=2, base_delay=0)
