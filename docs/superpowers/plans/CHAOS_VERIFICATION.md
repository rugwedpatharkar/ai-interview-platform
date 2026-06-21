# Chaos Verification — Profiles + Runbook

This is the chaos-injection harness for the platform's closed-loop hire flow. Each profile
exercises one infrastructure failure mode; the platform must complete the flow
under each one (possibly slower, possibly with retries) without leaking 5xx to clients
and without data loss.

Phase 6 ships the scaffolding only. Chaos runs are an ops exercise — execute before any
release to production and after any infrastructure change.

---

## Profiles

| Name | Proxy | What it injects | What it tests |
|---|---|---|---|
| `mongo-slow` | toxiproxy:mongo | 500ms latency ±50ms on every Mongo round-trip | Phase 1 Mongo timeout wrappers fire DEADLINE_EXCEEDED; clients get 503+retry-after, not a hang |
| `redis-pause` | toxiproxy:redis | 2s pause on all Redis connections | Phase 1 Redis timeout wrappers; session-read fallback; rate-limiter degrades gracefully |
| `rabbitmq-restart` | toxiproxy:rabbit | TCP connection reset (simulates broker restart) | Phase 2 idempotent consumers; DLX capture; consumers reconnect and resume without duplicate side-effects |
| `mcp-data-unavailable` | docker stop | mcp-data container stopped for 30s | Phase 1 mcp-data timeout wrappers in ai-agents; structured error returned to clients |

---

## Prerequisites

1. **toxiproxy running** (handled by the chaos overlay):

```bash
docker compose -f docker-compose.yml -f docker-compose.chaos.yml up -d
```

Wait for all services healthy:

```bash
docker compose -f docker-compose.yml -f docker-compose.chaos.yml ps
```

2. **smoke_e2e.py exists** — author by extending `scripts/smoke_login.py` to cover:
   - Login (already in smoke_login.py)
   - Job listing + view
   - Candidate application submit
   - Recruiter reads application + posts decision
   - Messaging (send + receive)

   See "Authoring smoke_e2e.py" below.

---

## How to run

```bash
# Single profile
bash scripts/run-chaos-smoke.sh mongo-slow

# All profiles in sequence (CI mode)
for profile in mongo-slow redis-pause rabbitmq-restart mcp-data-unavailable; do
  echo "=== $profile ==="
  bash scripts/run-chaos-smoke.sh "$profile"
done

# Tear down the whole stack after runs
docker compose -f docker-compose.yml -f docker-compose.chaos.yml down
```

---

## What to watch

### Logs (during run)

```bash
docker compose logs --follow --tail=50 admin ai-agents
```

**Expected signals:**

| Signal | Meaning |
|---|---|
| `DEADLINE_EXCEEDED` in structured logs | Timeout wrapper fired correctly — good |
| `log_context` key in every log line | Structured logging wired — good |
| `retry attempt N` | Resilience wrapper retrying — good |
| `INTERNAL` / uncaught Python traceback | BAD — regression, investigate immediately |
| Silent 200 with empty body | BAD — silent failure swallowing error |

### Audit trail

```python
# After each run: verify audit rows are written
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio, json

async def check():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    count = await client.interview_platform.audit_logs.count_documents({})
    print(f"audit_logs rows: {count}")

asyncio.run(check())
```

Audit rows must be present even when chaos fires — compliance requires it.

### Client errors

Check `client_errors` collection for any unexpected errors surfaced to the FE:

```python
async def check_client_errors():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    errors = await client.interview_platform.client_errors.find({}).to_list(20)
    for e in errors:
        print(json.dumps({k: str(v) for k, v in e.items() if k != "_id"}, indent=2))

asyncio.run(check_client_errors())
```

Errors are expected under chaos (API timeouts surface as `api.timeout` events). What must NOT appear: `INTERNAL`, stack traces, or unhandled promise rejections with no structured context.

---

## Authoring smoke_e2e.py

Extend `scripts/smoke_login.py` (which already tests login + health). The E2E script must:

1. Login as a recruiter (company) → create a job listing.
2. Login as a candidate → apply to the job.
3. Login as recruiter → view application + post a decision.
4. Exchange a message via the messaging RPC.
5. Assert all steps returned expected gRPC status codes (OK or expected domain errors).
6. Print a summary line: `PASS N/N steps` or `FAIL N/M steps: <which steps>`.

The script must exit 0 on success and non-zero on failure so `run-chaos-smoke.sh` can report the result.

---

## Toxiproxy API reference

The toxiproxy API runs at `http://localhost:8474`.

```bash
# List proxies
curl http://localhost:8474/proxies

# List toxics on a proxy
curl http://localhost:8474/proxies/mongo/toxics

# Add a toxic manually
curl -X POST http://localhost:8474/proxies/mongo/toxics \
  -H "Content-Type: application/json" \
  -d '{"name":"latency","type":"latency","attributes":{"latency":500,"jitter":50}}'

# Remove a toxic
curl -X DELETE http://localhost:8474/proxies/mongo/toxics/latency
```

---

## Status

| Phase | Status |
|---|---|
| Scaffolding (profiles + overlay + runner) | SHIPPED — Phase 6 Task 7 |
| smoke_e2e.py authoring | PENDING — ops exercise |
| First chaos run | PENDING — before production release |
| Chaos results documented | PENDING — fill in after first run |
