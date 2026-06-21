"""Provider-agnostic structured-output LLM backed by Google Gemini.

Agents depend only on the duck-typed `structured(prompt, schema)` contract (see the
fake in tests), so the heavy langchain import lives inside `__init__` — importing this
module (for linting or the retry helper) never requires langchain; only constructing
the real client does. LLM calls are an external boundary: each is bounded by a timeout
and a small retry/backoff, surfacing `LLMError` so the worker dead-letters rather than
crashing the consume loop.
"""

import asyncio
import time

from lib.logging import get_logger
from lib.observability import counter, histogram, span

from app.errors import LLMError
from lib import timeouts

log = get_logger(component="llm.gemini")

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
_llm_total = counter("llm_call_total", "LLM structured-output calls")
_llm_errors = counter("llm_call_errors_total", "LLM structured-output failures")
_llm_duration = histogram("llm_call_duration_ms", "LLM call duration (ms)")


async def _with_retry(factory, *, attempts, base_delay=0.5):
    """Await `factory()` up to `attempts` times with exponential backoff.

    Transient HTTP errors and malformed structured output both raise here; after the
    last attempt the cause is re-raised as `LLMError`.
    """
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return await factory()
        except Exception as exc:
            last = exc
            log.warning("LLM attempt {}/{} failed: {}", attempt + 1, attempts, exc)
            if attempt + 1 < attempts:
                await asyncio.sleep(base_delay * (2**attempt))
    raise LLMError("LLM call failed after retries") from last


class GeminiLLM:
    def __init__(
        self,
        model_id="gemini-2.5-flash",
        api_key="",
        temperature=0.2,
        timeout=None,
        max_retries=2,
    ):
        from langchain_google_genai import ChatGoogleGenerativeAI

        # Disable the provider's own retry (max_retries=0) so `_with_retry` is the
        # single retry authority, covering transport + output-parse failures alike.
        self._model = ChatGoogleGenerativeAI(
            model=model_id,
            google_api_key=api_key,
            temperature=temperature,
            timeout=timeout if timeout is not None else timeouts.llm_call(),
            max_retries=0,
        )
        self._attempts = max_retries + 1

    async def structured(self, prompt, schema):
        _llm_total.inc()
        t0 = time.monotonic()
        try:
            async with span(
                "llm.structured",
                schema=schema.__name__ if hasattr(schema, "__name__") else str(schema),
            ):
                result = await _with_retry(
                    lambda: self._model.with_structured_output(schema).ainvoke(prompt),
                    attempts=self._attempts,
                )
        except Exception:
            _llm_errors.inc()
            _llm_duration.observe((time.monotonic() - t0) * 1000)
            raise
        _llm_duration.observe((time.monotonic() - t0) * 1000)
        return result

    async def stream(self, prompt):
        # Token streaming for the chat answer (plain text, no schema). No mid-flight
        # retry — re-emitting partial tokens would corrupt the stream; a failure raises
        # LLMError and the route ends the SSE stream.
        try:
            async for chunk in self._model.astream(prompt):
                text = getattr(chunk, "content", "")
                if text:
                    yield text
        except Exception as exc:
            log.warning("LLM stream failed: {}", exc)
            raise LLMError("LLM stream failed") from exc
