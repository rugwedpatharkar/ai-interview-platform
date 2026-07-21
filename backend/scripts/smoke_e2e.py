"""E2E smoke driver for the chaos harness (run-chaos-smoke.sh).

Hits the running admin container at $ADMIN_URL (default http://localhost:8080) and
walks the smallest end-to-end path that exercises every stateful dependency: Mongo
(RegisterCompany writes users + companies), Redis (Login populates the refresh
session), the JWT round-trip (Me), and the HTTP transport (nginx / gRPC-web).

Exit codes:
    0 — every step passed
    non-0 — first failing step

The chaos harness expects this file to exist and to exit non-0 under toxic conditions
that break any of those pieces (a slow Mongo, a paused Redis, a restarted RabbitMQ, an
unavailable mcp-data). It intentionally does NOT test LLM paths — those depend on an
external Gemini/Groq round-trip and would flake for reasons unrelated to the
platform's own resilience.

Extend this script when the chaos coverage matures (e.g. add the apply-to-job path once
we want to cover the funnel + rabbit consumers).
"""

import asyncio
import os
import sys
from pathlib import Path

import httpx

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))

from smoke_login import _run  # noqa: E402 — sys.path is set above


async def _healthz(base: str) -> None:
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{base}/healthz")
        if r.status_code != 200:
            raise SystemExit(f"FAIL /healthz: HTTP {r.status_code}")
    print("  /healthz         -> 200")


async def _main() -> None:
    base = os.environ.get("ADMIN_URL", "http://localhost:8080")
    print(f"smoke_e2e: hitting {base}")
    await _healthz(base)
    await _run(base)
    print("PASS: smoke_e2e (healthz + auth round-trip)")


if __name__ == "__main__":
    asyncio.run(_main())
