# Robustness Phase 1 — Stop the Bleeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap every raw external-call site in the four hot services with `with_timeout(coro, timeouts.<class>(), op="...")`, demote expected-domain-error tracebacks at the gRPC boundary using Phase 0's `log_domain_error`, and tighten the `check_timeouts.py` gate guard so it no longer flags repo-wrapped methods or library helpers. The result: zero unbounded external waits and zero traceback noise from expected `NotFoundError`/`ExpiredSignatureError` in production logs.

**Architecture:** Three-pronged. (1) Tighten the gate-guard regex so it only flags raw pymongo/aioredis collection-method calls — repo methods (which are already wrapped through `BaseRepository`) and our own audit helpers stop being false-positives. (2) Wrap the 30 real call sites across `mcp-data/tools.py`, `mcp-capability/tools.py`, and the two `ai-agents/infra/` session stores using the Phase 0 settings knobs. (3) At the gRPC boundary catch sites (admin auth in particular), route expected typed errors through `log_domain_error` instead of `log.exception`. Each task deletes the wrapped lines from `scripts/.timeouts_allowlist.txt`, so the allowlist shrinks file-by-file and a regression literally can't merge.

**Tech Stack:** Python 3.12, pymongo motor-style async, redis-py asyncio, loguru, pytest (asyncio mode auto), ruff + the two Phase 0 gate guards.

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3 Phase 1 + §2.3 timeout knobs).
- Phase 0 helpers consumed: `lib.timeouts.mongo()`, `lib.timeouts.redis()`, `lib.resilience.with_timeout`, `lib.errors.AppError` hierarchy, `lib.logging.log_domain_error`. **Do not edit them — Phase 0 is closed.**
- Behavior preservation: NO change to request/response contracts, NO change to error codes a client depends on. Timeouts surface as `OperationTimeout` which the Phase-0 translator maps to gRPC `DEADLINE_EXCEEDED` — a behavior change ONLY for the truly stuck (>10s Mongo / >5s Redis) call, which previously hung indefinitely and now fails cleanly. Document this behavior in the Phase 1 HANDOFF.
- TDD mandatory: failing test → watched fail → minimal implementation → green → commit (per `PRODUCTION_STANDARDS.md §5`).
- Per-task commit on `main`; never change branch; stage explicit paths only (per the user's git-workflow memory; user explicitly authorized direct-on-main for this program).
- No backwards-compatibility shims; no defensive guards on typed params; no `except: pass`; no nested `try/except`; no per-call magic-number timeouts (per the user's global `CLAUDE.md` Python rules).
- Working directory for every command: `/Users/rugwedpatharkar/Projects/Project`. The previous worktree was deleted.
- Gate stays green throughout: `bash scripts/check.sh` exit 0 after every commit.
- Pre-commit gate per touched-file: BOTH `ruff format --check` AND `ruff check` exit 0, plus the relevant pytest suite. (Phase 0 lesson — `pytest` alone is insufficient.)
- Allowlist contract: every wrapped call deletes its corresponding line from `scripts/.timeouts_allowlist.txt` in the same commit. The gate guard exits 0 after the commit.
- Skipped from Phase 1 (already shipped by parallel session at commit `0942dec`): FE `transport.ts` cookie-refresh timeout, FE `tokens.ts` cross-tab token sync, FE login/callback redirect race. Phase 0 spec called these P0 items; they're done.

## Pre-Phase Audit Findings

The Phase 0 allowlist seeded 50 sites. Re-grep on `main` shows 51 sites broken down as:

| File | Sites | Reality |
|---|---|---|
| `src/mcp-data/app/tools.py` | 18 | **REAL** — direct pymongo `update_one`/`find_one`/`insert_one`/etc. on `_profiles`/`_jobs`/etc. |
| `src/admin/app/resources/compliance.py` | 16 | **FALSE POSITIVE** — `await self._reports.delete_by_applications(...)` is a repo method whose body uses `with_timeout` via `BaseRepository`. The guard's regex matches `await self._\w+\.(delete|insert|...)` and misfires on method names that *start* with those verbs. |
| `src/mcp-capability/app/tools.py` | 7 | **REAL** — raw `await redis.get/set/sismember/sadd/expire/incr` calls in `kb_search` and `_ingest_one`. |
| `lib/lib/audit.py` | 4 | **FALSE POSITIVE** — the audit helper module Phase 0 shipped. Its `enqueue_replay`/`drain_replay` deliberately don't `with_timeout` (callers control retries). The guard should not scan `lib/lib/audit.py`. |
| `src/ai-agents/app/infra/sessions.py` | 3 | **REAL** — raw `await self._redis.set/get/mget` in interview-session store. |
| `src/ai-agents/app/infra/practice_sessions.py` | 2 | **REAL** — raw `await self._redis.set/get` in practice-session store. |
| `src/admin/app/infra/notifier.py` | 1 | **FALSE POSITIVE** — `await self._publisher.publish(...)` delegates to `lib.rabbitmq.publisher.Publisher.publish` which already wraps with a publish-confirm + bounded retry per Phase 0 audit. |

**Real wraps: 30. False positives to filter via regex tightening: 21.**

## File Structure (lock-in)

**Modified files:**

| Path | Change |
|---|---|
| `scripts/check_timeouts.py` | Tighten regex patterns: match only known pymongo collection methods (`insert_one`/`insert_many`/`find_one`/`find`/`update_one`/`update_many`/`delete_one`/`delete_many`/`count_documents`/`aggregate`/`bulk_write`/`replace_one`/`distinct`/`estimated_document_count`) and known redis verbs (`set`/`get`/`mget`/`hget`/`hset`/`hgetall`/`hdel`/`sadd`/`srem`/`sismember`/`smembers`/`scard`/`rpush`/`lpush`/`lpop`/`rpop`/`lrange`/`llen`/`zadd`/`zrem`/`zrange`/`expire`/`ttl`/`incr`/`decr`/`del`/`exists`/`pipeline`). Exclude `lib/lib/audit.py` from `DEFAULT_ROOTS` — it's the helper module. |
| `scripts/.timeouts_allowlist.txt` | After regex tightening, the 21 false positives disappear. After each wrap task, delete the wrapped lines. By Phase 1 close, file should be empty (just header comments). |
| `src/mcp-data/app/tools.py` | Wrap 18 raw pymongo calls with `with_timeout(self._<coll>.<verb>(...), timeouts.mongo(), op=<existing op name>)`. Reuse the existing per-method `op="..."` label that's already used for Prometheus. |
| `src/mcp-capability/app/tools.py` | Wrap 7 raw redis calls with `with_timeout(redis.<verb>(...), timeouts.redis(), op="kb_search.cache_get"/"kb_search.cache_set"/"kb_search.dedup_check"/"ingest.dedup_add"/"ingest.version_bump"/etc.)`. |
| `src/ai-agents/app/infra/sessions.py` | Wrap 3 raw redis calls (`set`/`get`/`mget`) with `with_timeout(..., timeouts.redis(), op="interview_session.save"/"get"/"mget")`. |
| `src/ai-agents/app/infra/practice_sessions.py` | Wrap 2 raw redis calls similarly. |
| `lib/lib/grpcweb.py` | At the existing `except Exception as exc:` boundary block (introduced in Phase 0 Task 5), the `log_domain_error` path is ALREADY active for the 5 typed AppError codes. Verify by reading lines ~106–115 and ~148–157. No code change unless a gap exists — but ALSO check that downstream resource catch sites (e.g. `admin/app/resources/auth.py` `_STATUS` ladder) which translate JWT decoder errors are routed through `log_domain_error`. Specifically: locate the `ExpiredSignatureError` / `InvalidTokenError` catch site that currently calls `log.exception` and swap to `log_domain_error`. |

**New tests (under `lib/tests/`, `scripts/tests/`, or per-service test dirs):**

| Path | Tests what |
|---|---|
| `scripts/tests/test_check_timeouts.py` (extend) | Add cases: repo-method-style call (`await self._reports.delete_by_applications(x)`) does NOT flag; publisher call (`await self._publisher.publish(x, y)`) does NOT flag; raw `await self._collection.find_one({})` DOES flag; raw `await redis.get('k')` DOES flag. |
| `src/mcp-data/tests/test_tools_timeouts.py` (new) | One test per `DataStore` method that runs the method against a fake collection which sleeps 11s; assert `OperationTimeout` raised within `mongo_op_timeout_seconds`. Use `asyncio.sleep` + `monkeypatch` of `timeouts.mongo()` for fast tests. |
| `src/mcp-capability/tests/test_tools_timeouts.py` (new) | Same pattern for the 7 redis sites. |
| `src/ai-agents/tests/test_sessions_timeouts.py` (new) | Same for sessions.py + practice_sessions.py. |
| `src/admin/tests/test_auth_log_demotion.py` (new) | Trigger an `ExpiredSignatureError` path; assert log record level is DEBUG with no traceback. |

---

## Task 1 — Tighten `check_timeouts.py` regex + exclude lib/lib/audit.py

**Files:**
- Modify: `scripts/check_timeouts.py`
- Modify: `scripts/.timeouts_allowlist.txt` (remove 21 false-positive lines)
- Modify: `scripts/tests/test_check_timeouts.py` (add false-positive non-flag cases)

**Interfaces:**
- Consumes: nothing (script is self-contained).
- Produces: a guard that flags ONLY raw pymongo/redis calls. Repo methods (`delete_by_applications`, `list_by_candidate`, etc.) and the Phase 0 audit helpers stop being false positives.

- [ ] **Step 1.1: Read the current script to confirm patterns**

Run: `Read scripts/check_timeouts.py`

- [ ] **Step 1.2: Write failing tests for the new behavior**

Append to `scripts/tests/test_check_timeouts.py`:

```python
def test_repo_method_call_is_not_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "compliance_like.py"
    # Mirrors compliance.py:erase — repo methods that start with delete/insert/etc.
    bad.write_text(
        "class C:\n"
        "    async def x(self, app_id):\n"
        "        await self._reports.delete_by_applications([app_id])\n"
        "        await self._slots.delete_by_applications([app_id])\n"
    )
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py"),
         "--root", str(tmp_path)],
        capture_output=True, text=True, cwd=repo,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_publisher_publish_is_not_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "notifier_like.py"
    bad.write_text(
        "class P:\n"
        "    async def notify(self, x):\n"
        "        await self._publisher.publish('routing.key', x)\n"
    )
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py"),
         "--root", str(tmp_path)],
        capture_output=True, text=True, cwd=repo,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_raw_collection_method_is_flagged(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    bad = tmp_path / "raw_pymongo.py"
    bad.write_text(
        "class D:\n"
        "    async def x(self, doc):\n"
        "        await self._profiles.update_one({'_id': 1}, {'$set': doc})\n"
    )
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py"),
         "--root", str(tmp_path)],
        capture_output=True, text=True, cwd=repo,
    )
    assert result.returncode != 0
    assert "raw_pymongo.py" in result.stdout + result.stderr
```

- [ ] **Step 1.3: Run tests to verify they fail**

Run: `./.venv/bin/python -m pytest scripts/tests/test_check_timeouts.py -v`
Expected: 3 new tests FAIL (current regex over-matches the repo + publisher tests).

- [ ] **Step 1.4: Tighten the patterns + exclude `lib/lib/audit.py`**

In `scripts/check_timeouts.py`, replace `EXTERNAL_PATTERNS` with explicit-method-name regexes:

```python
_PYMONGO_VERBS = (
    "insert_one|insert_many|"
    "find_one|find|"
    "update_one|update_many|"
    "delete_one|delete_many|"
    "count_documents|estimated_document_count|distinct|"
    "aggregate|bulk_write|replace_one|find_one_and_update|"
    "find_one_and_replace|find_one_and_delete"
)
_REDIS_VERBS = (
    "set|get|mget|delete|exists|expire|ttl|incr|decr|"
    "hset|hget|hgetall|hdel|hexists|hmget|hmset|"
    "sadd|srem|sismember|smembers|scard|spop|"
    "rpush|lpush|lpop|rpop|lrange|llen|lrem|"
    "zadd|zrem|zrange|zincrby|zscore|zcard|"
    "publish|subscribe|scan_iter|pipeline"
)

EXTERNAL_PATTERNS = [
    re.compile(rf"await\s+self\._collection\.({_PYMONGO_VERBS})\("),
    re.compile(rf"await\s+self\._\w+\.({_PYMONGO_VERBS})\("),  # _profiles, _jobs, etc.
    re.compile(rf"await\s+redis\.({_REDIS_VERBS})\("),
    re.compile(rf"await\s+self\._r\.({_REDIS_VERBS})\("),
    re.compile(rf"await\s+self\._redis\.({_REDIS_VERBS})\("),
    re.compile(r"httpx\.AsyncClient\("),
    re.compile(r"await\s+httpx\.(get|post|put|delete|patch|request)\("),
    re.compile(r"requests\.(get|post|put|delete|patch|request)\("),
]
```

Also update `DEFAULT_ROOTS` (or, cleaner, the per-file skip in `scan()`):

```python
_FILE_EXCLUDES = {
    Path("lib/lib/audit.py"),  # helper module — callers control retry/timeout
}
```

In `scan()`, after `for py in root.rglob("*.py"):`, add:

```python
if "/pb/" in str(py) or "/tests/" in str(py):
    continue
try:
    rel_to_repo = py.resolve().relative_to(Path.cwd().resolve())
    if rel_to_repo in _FILE_EXCLUDES:
        continue
except ValueError:
    pass
```

- [ ] **Step 1.5: Strip false-positive lines from the allowlist**

Run:
```
cd /Users/rugwedpatharkar/Projects/Project && grep -v "compliance.py" scripts/.timeouts_allowlist.txt | grep -v "notifier.py" | grep -v "lib/lib/audit.py" > scripts/.timeouts_allowlist.txt.new
mv scripts/.timeouts_allowlist.txt.new scripts/.timeouts_allowlist.txt
```

The file now has just the 30 real sites + header comments.

- [ ] **Step 1.6: Run tests + the script itself**

Run:
```
./.venv/bin/ruff format --check scripts/check_timeouts.py scripts/tests/test_check_timeouts.py
./.venv/bin/ruff check scripts/check_timeouts.py scripts/tests/test_check_timeouts.py
./.venv/bin/python -m pytest scripts/tests/test_check_timeouts.py -v
./.venv/bin/python scripts/check_timeouts.py
```
Expected: ruff PASS, all 5 tests PASS, script exits 0 (30 real sites still allowlisted).

- [ ] **Step 1.7: Run the full gate**

Run: `bash scripts/check.sh`
Expected: GATE PASSED.

- [ ] **Step 1.8: Commit**

```bash
cd /Users/rugwedpatharkar/Projects/Project
git add scripts/check_timeouts.py scripts/.timeouts_allowlist.txt scripts/tests/test_check_timeouts.py
git commit -m "fix(scripts): tighten check_timeouts regex — skip repo methods + lib helpers"
```

---

## Task 2 — Wrap 18 Mongo calls in `src/mcp-data/app/tools.py`

**Files:**
- Modify: `src/mcp-data/app/tools.py` (18 sites)
- Modify: `scripts/.timeouts_allowlist.txt` (remove 18 lines)
- Test: `src/mcp-data/tests/test_tools_timeouts.py` (new, 1 representative test)

**Interfaces:**
- Consumes: `lib.resilience.with_timeout`, `lib.timeouts.mongo()`.
- Produces: zero behavior change on the happy path; a 10s Mongo hang now raises `OperationTimeout` which the gRPC translator maps to `DEADLINE_EXCEEDED`.

- [ ] **Step 2.1: Read tools.py end-to-end** (it's ~535 lines)

Run: `Read src/mcp-data/app/tools.py`

Note each of the 18 sites' raw `await self._<coll>.<verb>(...)` patterns + the existing `op="..."` string defined just above it.

- [ ] **Step 2.2: Add the imports**

Top of `tools.py`:

```python
from lib import timeouts
from lib.resilience import with_timeout
```

(Keep existing imports; add these to the `from lib.*` group per isort.)

- [ ] **Step 2.3: Write a representative failing test**

Create `src/mcp-data/tests/test_tools_timeouts.py`:

```python
import asyncio

import pytest

from app.tools import DataStore
from lib import timeouts
from lib.resilience import OperationTimeout


class _SlowCollection:
    """A fake collection whose update_one sleeps longer than the timeout."""

    async def update_one(self, *args, **kwargs):
        await asyncio.sleep(2.0)


class _Db(dict):
    def __init__(self):
        super().__init__()
        for name in [
            "candidate_profiles", "jobs", "aptitude_banks", "interviews",
            "reports", "applications", "match_results", "job_question_plans",
            "proctoring_events", "practice_sessions",
        ]:
            self[name] = _SlowCollection()

    def __getitem__(self, k):
        return super().__getitem__(k)


@pytest.mark.asyncio
async def test_save_profile_respects_mongo_timeout(monkeypatch):
    monkeypatch.setenv("MONGO_OP_TIMEOUT_SECONDS", "0.05")
    # Reset the timeouts cache so the new env value is picked up.
    timeouts._cached_settings = None
    store = DataStore(_Db())
    with pytest.raises(OperationTimeout):
        await store.save_profile("u1", {"name": "Alice"})
```

- [ ] **Step 2.4: Run test to confirm RED**

Run: `cd src/mcp-data && ../../.venv/bin/python -m pytest tests/test_tools_timeouts.py -v`
Expected: FAIL — the test hangs ~2s then sees no `OperationTimeout` (the call isn't wrapped).

- [ ] **Step 2.5: Wrap each of the 18 sites**

For each `await self._<coll>.<verb>(args...)` inside the `async with span(...)` block, replace with:

```python
await with_timeout(
    self._<coll>.<verb>(args...),
    timeouts.mongo(),
    op="<existing op>",
)
```

Where `<existing op>` is the `op = "save_profile"` (or similar) literal already defined above the `try:` block.

EXAMPLE — `save_profile` becomes:

```python
async def save_profile(self, user_id, doc):
    async with log_context(log, "data.save_profile", **bind_ids(user_id=user_id)):
        t0 = time.monotonic()
        op = "save_profile"
        _mongo_total.labels(op=op).inc()
        try:
            async with span("mongo.save_profile", user_id=user_id):
                await with_timeout(
                    self._profiles.update_one(
                        {"user_id": user_id},
                        {"$set": {**doc, "parsed": True}},
                        upsert=True,
                    ),
                    timeouts.mongo(),
                    op=op,
                )
        except Exception:
            _mongo_errors.labels(op=op).inc()
            raise
        finally:
            _mongo_duration.labels(op=op).observe(_ms(t0))
```

Repeat for all 18 sites. The lines are `tools.py:69, 87, 106, 122, 142, 155, 180, 200, 219, 246, 279, 339, 394, 414, 440, 476, 512, 532` per the allowlist.

- [ ] **Step 2.6: Pre-commit gate**

Run:
```
cd /Users/rugwedpatharkar/Projects/Project
./.venv/bin/ruff format --check src/mcp-data/app/tools.py src/mcp-data/tests/test_tools_timeouts.py
./.venv/bin/ruff check src/mcp-data/app/tools.py src/mcp-data/tests/test_tools_timeouts.py
(cd src/mcp-data && ../../.venv/bin/python -m pytest -q)
```

- [ ] **Step 2.7: Strip the 18 mcp-data lines from the allowlist**

```
cd /Users/rugwedpatharkar/Projects/Project
grep -v "src/mcp-data/app/tools.py:" scripts/.timeouts_allowlist.txt > scripts/.timeouts_allowlist.txt.new
mv scripts/.timeouts_allowlist.txt.new scripts/.timeouts_allowlist.txt
./.venv/bin/python scripts/check_timeouts.py
```
Expected: exit 0 (12 sites remaining in allowlist).

- [ ] **Step 2.8: Full gate + commit**

```
bash scripts/check.sh
git add src/mcp-data/app/tools.py src/mcp-data/tests/test_tools_timeouts.py scripts/.timeouts_allowlist.txt
git commit -m "feat(mcp-data): wrap 18 Mongo ops with with_timeout(timeouts.mongo())"
```

---

## Task 3 — Wrap 7 Redis calls in `src/mcp-capability/app/tools.py`

**Files:**
- Modify: `src/mcp-capability/app/tools.py` (7 sites at lines 133, 135, 152, 183, 203, 204, 207)
- Modify: `scripts/.timeouts_allowlist.txt` (remove 7 lines)
- Test: `src/mcp-capability/tests/test_tools_timeouts.py` (new)

**Interfaces:**
- Consumes: `lib.resilience.with_timeout`, `lib.timeouts.redis()`.
- Produces: zero behavior change on the happy path.

- [ ] **Step 3.1: Read the file's `kb_search`/`_ingest_one` functions**

Run: `Read src/mcp-capability/app/tools.py` lines 120–210.

- [ ] **Step 3.2: Add imports** at module top:

```python
from lib import timeouts
from lib.resilience import with_timeout
```

- [ ] **Step 3.3: Write failing test**

Create `src/mcp-capability/tests/test_tools_timeouts.py`:

```python
import asyncio
import pytest
from lib import timeouts
from lib.resilience import OperationTimeout


class _SlowRedis:
    async def get(self, key):
        await asyncio.sleep(2.0)


@pytest.mark.asyncio
async def test_kb_search_cache_get_respects_redis_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts._cached_settings = None
    redis = _SlowRedis()
    from app.tools import _cache_get   # IF such helper exists; else test kb_search directly
    with pytest.raises(OperationTimeout):
        await _cache_get(redis, "owner", "topic", "q")
```

(If no helper is extracted, replace with a test that calls `kb_search` directly via a stub embedder/fetcher.)

- [ ] **Step 3.4: Verify RED**

- [ ] **Step 3.5: Wrap each of the 7 Redis calls**

Pattern:

```python
# was:  result = await redis.get(cache_key)
# now:
result = await with_timeout(
    redis.get(cache_key),
    timeouts.redis(),
    op="kb_search.cache_get",
)
```

Use distinct `op="..."` labels per site:
- `:133` → `op="kb_search.version_read"`
- `:135` → `op="kb_search.cache_get"`
- `:152` → `op="kb_search.cache_set"`
- `:183` → `op="ingest.dedup_check"`
- `:203` → `op="ingest.dedup_add"`
- `:204` → `op="ingest.dedup_expire"`
- `:207` → `op="ingest.version_bump"`

- [ ] **Step 3.6: Pre-commit gate + strip allowlist + commit**

```
./.venv/bin/ruff format --check src/mcp-capability/app/tools.py src/mcp-capability/tests/test_tools_timeouts.py
./.venv/bin/ruff check src/mcp-capability/app/tools.py src/mcp-capability/tests/test_tools_timeouts.py
(cd src/mcp-capability && ../../.venv/bin/python -m pytest -q)
grep -v "src/mcp-capability/app/tools.py:" scripts/.timeouts_allowlist.txt > x && mv x scripts/.timeouts_allowlist.txt
./.venv/bin/python scripts/check_timeouts.py
bash scripts/check.sh
git add src/mcp-capability/app/tools.py src/mcp-capability/tests/test_tools_timeouts.py scripts/.timeouts_allowlist.txt
git commit -m "feat(mcp-capability): wrap 7 Redis ops with with_timeout(timeouts.redis())"
```

---

## Task 4 — Wrap 3 Redis calls in `src/ai-agents/app/infra/sessions.py`

**Files:**
- Modify: `src/ai-agents/app/infra/sessions.py` (3 sites at lines 64, 83, 119)
- Modify: `scripts/.timeouts_allowlist.txt` (remove 3 lines)
- Test: `src/ai-agents/tests/test_sessions_timeouts.py` (new)

- [ ] **Step 4.1: Read the three call sites**

Lines 64 (`self._redis.set(...)` in `save`), 83 (`self._redis.get(...)` in `get`), 119 (`self._redis.mget(...)` in `list_in_progress`).

- [ ] **Step 4.2: Add imports**: `from lib import timeouts` and `from lib.resilience import with_timeout`.

- [ ] **Step 4.3: Write a representative failing test** (in `src/ai-agents/tests/test_sessions_timeouts.py`):

```python
import asyncio
import pytest
from lib import timeouts
from lib.resilience import OperationTimeout
from app.infra.sessions import RedisInterviewSessionStore


class _SlowRedis:
    async def set(self, *a, **k):
        await asyncio.sleep(2.0)


@pytest.mark.asyncio
async def test_save_respects_redis_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts._cached_settings = None
    store = RedisInterviewSessionStore(_SlowRedis(), ns="interview", ttl=3600)
    # Build a minimal valid InterviewSession — use an existing test fixture pattern.
    # If awkward, just call the lower-level method directly.
    # Pseudo:
    # with pytest.raises(OperationTimeout):
    #     await store.save(some_session)
```

(Adjust the import path of the store class to match what `sessions.py` exports. If the constructor signature is heavy, instead unit-test the underlying redis op directly via a helper extraction — or test through the store with a minimal valid InterviewSession.)

- [ ] **Step 4.4: Verify RED.**

- [ ] **Step 4.5: Wrap the 3 sites**

```python
# :64 — save
await with_timeout(
    self._redis.set(self._key(session.application_id), session.model_dump_json(), ex=ttl),
    timeouts.redis(),
    op="interview_session.save",
)

# :83 — get
raw = await with_timeout(
    self._redis.get(self._key(application_id)),
    timeouts.redis(),
    op="interview_session.get",
)

# :119 — list_in_progress mget
raws = await with_timeout(
    self._redis.mget(*keys),
    timeouts.redis(),
    op="interview_session.list_in_progress",
)
```

- [ ] **Step 4.6: Pre-commit gate + strip allowlist + commit**

```
./.venv/bin/ruff format --check src/ai-agents/app/infra/sessions.py src/ai-agents/tests/test_sessions_timeouts.py
./.venv/bin/ruff check src/ai-agents/app/infra/sessions.py src/ai-agents/tests/test_sessions_timeouts.py
(cd src/ai-agents && ../../.venv/bin/python -m pytest -q)
grep -v "src/ai-agents/app/infra/sessions.py:" scripts/.timeouts_allowlist.txt > x && mv x scripts/.timeouts_allowlist.txt
./.venv/bin/python scripts/check_timeouts.py
bash scripts/check.sh
git add src/ai-agents/app/infra/sessions.py src/ai-agents/tests/test_sessions_timeouts.py scripts/.timeouts_allowlist.txt
git commit -m "feat(ai-agents): wrap 3 Redis ops in sessions.py with with_timeout"
```

---

## Task 5 — Wrap 2 Redis calls in `src/ai-agents/app/infra/practice_sessions.py`

**Files:**
- Modify: `src/ai-agents/app/infra/practice_sessions.py` (2 sites at lines 30, 35)
- Modify: `scripts/.timeouts_allowlist.txt` (remove 2 lines)
- Test: Append to `src/ai-agents/tests/test_sessions_timeouts.py`.

- [ ] **Step 5.1: Read the two sites** in `practice_sessions.py`.

- [ ] **Step 5.2: Add imports** (same as Task 4).

- [ ] **Step 5.3: Append a failing test** for one of the two methods.

- [ ] **Step 5.4: Verify RED.**

- [ ] **Step 5.5: Wrap both sites** with `op="practice_session.save"` and `op="practice_session.get"` respectively.

- [ ] **Step 5.6: Pre-commit + strip + commit**

```
./.venv/bin/ruff format --check src/ai-agents/app/infra/practice_sessions.py
./.venv/bin/ruff check src/ai-agents/app/infra/practice_sessions.py
(cd src/ai-agents && ../../.venv/bin/python -m pytest -q)
grep -v "src/ai-agents/app/infra/practice_sessions.py:" scripts/.timeouts_allowlist.txt > x && mv x scripts/.timeouts_allowlist.txt
./.venv/bin/python scripts/check_timeouts.py
bash scripts/check.sh
git add src/ai-agents/app/infra/practice_sessions.py src/ai-agents/tests/test_sessions_timeouts.py scripts/.timeouts_allowlist.txt
git commit -m "feat(ai-agents): wrap 2 Redis ops in practice_sessions.py with with_timeout"
```

After this commit, `scripts/.timeouts_allowlist.txt` should contain ONLY the header comment lines (zero remaining sites). Verify with `grep -v "^#" scripts/.timeouts_allowlist.txt | grep -v "^$" | wc -l` → 0.

---

## Task 6 — Demote expected-domain-error tracebacks at the gRPC boundary

**Files:**
- Modify: `src/admin/app/resources/auth.py` and any other resource that catches `ExpiredSignatureError` / `InvalidTokenError` / `NotFoundError` and logs `log.exception` for the expected case.
- Test: `src/admin/tests/test_auth_log_demotion.py` (new)

**Background:** Commit `24e117b` documents the noise: every dashboard load for a profile-less user logs a `NotFoundError("No profile yet")` traceback. Every access-token refresh logs `ExpiredSignatureError → InvalidTokenError` traceback. The client receives correct gRPC status (the Phase-0 translator handles that); the problem is server-side noise.

Phase 0 shipped `log_domain_error(log, err, **ctx)`. The translator (Phase 0 Task 5) already routes the 5 typed domain-error codes through it at the egress boundary. But upstream catch sites in resources may still call `log.exception` directly before re-raising — those are the noise sources.

- [ ] **Step 6.1: Find the catch sites**

```bash
cd /Users/rugwedpatharkar/Projects/Project
grep -rn "log.exception\|logger.exception" src/admin/app/resources/ | grep -iE "(expired|invalid.*token|not.*found|auth)" | head -20
grep -rn "ExpiredSignatureError\|InvalidTokenError" src/admin/ | head -20
grep -rn "NotFoundError" src/admin/app/resources/profile.py | head -10
```

Read each hit's surrounding code (10 lines before/after) to understand the catch context.

- [ ] **Step 6.2: For each expected-error catch site, replace `log.exception(...)` with `log_domain_error(log, err, ...)`**

Pattern:

```python
# was:
except ExpiredSignatureError as exc:
    log.exception("token expired for user_id={}", uid)
    raise AuthError("token expired") from exc

# now:
from lib.logging import log_domain_error
# ...
except ExpiredSignatureError as exc:
    err = AuthError("token expired")
    log_domain_error(log, err, user_id=uid)
    raise err from exc
```

Apply to: every ExpiredSignatureError catch, every InvalidTokenError catch, every NotFoundError catch that the audit confirms is an EXPECTED no-such-profile case (NOT an internal bug surfacing).

- [ ] **Step 6.3: Write a verification test**

Create `src/admin/tests/test_auth_log_demotion.py`:

```python
import pytest
from lib.logging import logger as loguru_logger

from app.resources.auth import AuthResource  # adjust import to actual class


class _Sink:
    def __init__(self):
        self.records = []

    def __call__(self, message):
        self.records.append(message.record)


@pytest.mark.asyncio
async def test_expired_token_logs_at_debug_no_traceback(monkeypatch):
    sink = _Sink()
    handler_id = loguru_logger.add(sink, level="DEBUG", format="{message}")
    try:
        # Construct an AuthResource with a token store that raises ExpiredSignatureError
        # on decode, then call the path that catches it.
        # ... (test stub varies — adapt to actual fakes used in src/admin/tests/conftest.py)
        # After the call:
        debug = [r for r in sink.records if r["level"].name == "DEBUG"]
        assert any("token expired" in r["message"] for r in debug)
        assert all(r["exception"] is None for r in debug)
    finally:
        loguru_logger.remove(handler_id)
```

(Adapt to the actual fakes in `src/admin/tests/conftest.py`.)

- [ ] **Step 6.4: Verify RED → GREEN.**

- [ ] **Step 6.5: Pre-commit + commit**

```
./.venv/bin/ruff format --check src/admin/app/resources/auth.py src/admin/tests/test_auth_log_demotion.py
./.venv/bin/ruff check src/admin/app/resources/auth.py src/admin/tests/test_auth_log_demotion.py
(cd src/admin && ../../.venv/bin/python -m pytest -q)
bash scripts/check.sh
git add src/admin/app/resources/auth.py src/admin/tests/test_auth_log_demotion.py
git commit -m "fix(admin): route expected ExpiredSignature/NotFound through log_domain_error"
```

---

## Task 7 — Phase 1 HANDOFF doc + memory pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-robustness-phase-1-handoff.md`
- Modify: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md` (append one line)
- Create: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-1.md`

- [ ] **Step 7.1: Write `docs/superpowers/plans/2026-06-21-robustness-phase-1-handoff.md`**

Template:

```markdown
# Robustness Phase 1 — HANDOFF (2026-06-21)

Phase 1 closed: every raw external-call site in the four hot services is wrapped with
`with_timeout`, the `check_timeouts` guard is tightened to skip repo-wrapped methods,
expected domain errors no longer log tracebacks. `scripts/.timeouts_allowlist.txt` is
now empty (header-only).

Gate: `bash scripts/check.sh` exit 0.

## Shipped

- Task 1 — `scripts/check_timeouts.py` regex tightened to explicit pymongo + redis verb
  list; `lib/lib/audit.py` excluded; 21 false-positive lines stripped from allowlist.
- Task 2 — `src/mcp-data/app/tools.py`: 18 Mongo ops wrapped.
- Task 3 — `src/mcp-capability/app/tools.py`: 7 Redis ops wrapped.
- Task 4 — `src/ai-agents/app/infra/sessions.py`: 3 Redis ops wrapped.
- Task 5 — `src/ai-agents/app/infra/practice_sessions.py`: 2 Redis ops wrapped.
- Task 6 — expected ExpiredSignature / NotFound now log at DEBUG without traceback.

## What Phase 2 consumes

- Phase 0 helpers continue to be the substrate: `lib.errors.AppError`, `lib.timeouts.*`,
  `lib.logging.log_context`, `lib.logging.log_domain_error`, `lib.audit.write_audit`.
- The empty `scripts/.timeouts_allowlist.txt` means: ANY new uninstrumented external
  call in admin / ai-agents / mcp-data / mcp-capability hard-blocks the gate.
- Phase 2 next: wrap ~192 admin resource functions in `log_context`; central
  translator replaces per-resource `_STATUS` dicts; audit-log gap sweep.

## Behavior changes documented

- A Mongo call that previously hung indefinitely now raises `OperationTimeout` after
  10s (default); the Phase-0 grpcweb translator maps this to gRPC `DEADLINE_EXCEEDED`.
  Clients see a failed call instead of waiting forever — net win.
- A Redis call hang now raises after 5s, same translation.
- Tunable via env: `MONGO_OP_TIMEOUT_SECONDS`, `REDIS_OP_TIMEOUT_SECONDS`.
```

- [ ] **Step 7.2: Create `~/.claude/projects/.../memory/robustness-phase-1.md`**

```markdown
---
name: robustness-phase-1
description: Phase 1 of the platform-robustness program closed 2026-06-21 on main. All 30 raw external-call sites wrapped with with_timeout in the four hot services; expected domain-error tracebacks demoted to DEBUG; check_timeouts regex tightened; allowlist empty.
metadata:
  type: project
---

Phase 1 shipped on `main` 2026-06-21.

**What landed:**
- check_timeouts.py regex tightened (explicit pymongo + redis verb lists; lib/lib/audit.py excluded).
- mcp-data tools.py — 18 Mongo ops wrapped.
- mcp-capability tools.py — 7 Redis ops wrapped.
- ai-agents sessions.py — 3 + practice_sessions.py — 2 Redis ops wrapped.
- admin auth.py — ExpiredSignature/NotFound paths route through log_domain_error.

**Why:** all four hot services are now timeout-safe; expected domain errors no longer
pollute logs with tracebacks; the gate guard prevents regression.

**How to apply:** Phase 2 work starts here. `scripts/.timeouts_allowlist.txt` is empty
— any new raw external call hard-blocks the gate. Use `with_timeout(coro,
timeouts.<class>(), op="...")` everywhere.

HANDOFF doc: docs/superpowers/plans/2026-06-21-robustness-phase-1-handoff.md.
Phase 0 substrate: [[robustness-phase-0]].
Program spec: [[interview-platform-robustness-spec]].
```

- [ ] **Step 7.3: Append to MEMORY.md**:

```markdown
- [Robustness Phase 1 (2026-06-21)](robustness-phase-1.md) — 30 external-call sites wrapped + traceback demotion + allowlist empty; commits on main
```

- [ ] **Step 7.4: Commit (only the HANDOFF doc; memory files live outside the repo)**

```
cd /Users/rugwedpatharkar/Projects/Project
git add docs/superpowers/plans/2026-06-21-robustness-phase-1-handoff.md
git commit -m "docs(robustness-phase-1): HANDOFF — phase 1 close + behavior delta"
```

---

## Self-review

**1. Spec coverage:**
- §3 Phase 1 backend wraps (mcp-data 18 + mcp-capability 7 + ai-agents sessions 3) → Tasks 2, 3, 4 ✓
- §3 Phase 1 traceback demotion → Task 6 ✓
- §3 Phase 1 FE items → ALREADY SHIPPED by parallel session (`0942dec`); noted in Global Constraints.
- §2.3 timeout knob consumption → Tasks 2–5 use `timeouts.mongo()` / `timeouts.redis()` ✓
- Bonus surfaced: practice_sessions.py 2 sites + gate-guard tightening → Tasks 1, 5 ✓
- HANDOFF + memory → Task 7 ✓

**2. Placeholder scan:**
- Task 4 / 5 testing notes acknowledge "adjust import path to match what `sessions.py` exports" — this is operational latitude, not a placeholder.
- Task 6 test stub uses `# ...` for the actual store-construction call — the implementer reads conftest fakes to fill in. Acceptable because each service test suite has its own fixture pattern; pinning a single recipe would be wrong.

**3. Type / signature consistency:**
- `with_timeout(coro, seconds, *, op)` signature matches `lib/lib/resilience.py:28` ✓
- `timeouts.mongo() -> float` / `timeouts.redis() -> float` per Phase 0 ✓
- `log_domain_error(log, err, **ctx) -> None` per Phase 0 ✓
- `OperationTimeout` raised by `with_timeout` is mapped by the Phase-0 translator to `DEADLINE_EXCEEDED` per `lib/lib/errors.py` `_STATUS_MAP` ✓

**4. Gate impact:**
- Each task explicitly runs `scripts/check.sh` before commit ✓
- Allowlist shrinks deterministically — empty after Task 5 ✓
- Pre-commit gate (ruff format + ruff check + pytest) called out in every task ✓

No issues found. Plan ready.

---

## What this plan does NOT cover (deferred to Phase 2+)

- Admin resource-layer `log_context` coverage (~192 functions) — Phase 2.
- Per-resource `_STATUS` dict replacement with central translator — Phase 2.
- Audit-log gap sweep — Phase 2.
- ~25 catch-and-reraise blocks in mcp-data/ai-agents that lack error logs — Phase 2.

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-2-backend-sweep.md` (after Phase 1 closes).
