# Code Execution Sandbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use
> `- [ ]` checkboxes. Spec: `docs/superpowers/v2/2026-06-19-code-execution-sandbox-design.md`.
> Build this **before** the Rich-Assessments plan — its `grade_coding` grader consumes
> `run_code`.

**Goal:** Add a `run_code(language, source, test_cases)` tool to **mcp-capability** that runs
**untrusted candidate code** against test cases in a disposable, locked-down **Docker**
container and returns per-case results. The tool sits behind an injected **`CodeRunner`**
seam with a **`FakeCodeRunner`** so `bash scripts/check.sh` **never starts a container**. The
real `DockerCodeRunner` is the **only** module that imports the Docker SDK.

**Architecture:** Mirror the existing capability seams (`app/seams/embedder.py`,
`vector_store.py`, `fetcher.py`) and tool functions (`app/tools.py`): a transport-agnostic
`run_code(...)` function takes a `runner=` kwarg and does **boundary validation** (language
allow-list, source-size cap, case-shape validation) before delegating; `server.py` wraps it
as a `@mcp.tool()` and builds the `DockerCodeRunner` lazily via the existing
`_ensure_rag()`-style double-checked lock. ai-agents (and admin, for grading) call it via the
existing MCP client (`app/infra/mcp_capability.py::McpCapability`). The runner returns
**structured failure** for candidate-caused outcomes (timeout/oom/wrong/error as data) and
raises a typed **`SandboxError`** only for infrastructure failure.

**Tech Stack (pinned — verify current at install):** `docker` Python SDK (`docker-py`, latest
7.x) — **call-local import, real runner only**. Language images: a slim **Python** image
(`python:3.12-slim`, pinned by digest) and a slim **Node** image (`node:22-slim`, pinned by
digest), each rebuilt locally to add a **non-root user** + drop to the frozen offline stdlib.
No new runtime dependency reaches the gate (the SDK is only imported by `DockerCodeRunner`,
which tests never instantiate).

## Global Constraints
- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the
  gate"**: `bash scripts/check.sh` (ruff format + lint S-rules line-88, pip-audit, pytest)
  must stay green; **baseline today is 423 tests.** The gate must remain **container-free** —
  all unit tests use `FakeCodeRunner`; Docker is exercised only in the manual/integration
  checks (Task 6), never in the gate.
- **Security bar — STOP-SHIP invariants (spec §4).** The live runner MUST enforce all of:
  S1 `--network=none` · S2 read-only image FS + tmpfs scratch + read-only source mount ·
  S3 non-root + `--cap-drop=ALL` + `--security-opt=no-new-privileges` · S4 `--memory=256m`
  (no swap) · S5 `--cpus=0.5` · S6 `--pids-limit=64` · S7 **host-side** wall-clock kill (not an
  in-container limit) · S8 output byte cap · S9 **always** kill + remove container + delete
  temp dir in `finally` · S10 **one container per run** (no reuse). In-process execution is
  **forbidden** — there is no acceptable `exec`/`subprocess`/RestrictedPython path.
- **Robustness (every new module):** validate untrusted input at the tool boundary; wrap every
  Docker SDK call in try/except with `get_logger(...)` structured logs + a typed `SandboxError`;
  bounded retries only for transient daemon errors (NOT for candidate-code timeouts — those are
  results); **always release resources in `finally`**; no bare `except: pass`; trust internal
  typed calls. Follow `~/.claude/CLAUDE.md` + `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Flexibility:** `CodeRunner` is an injected seam — swapping `DockerCodeRunner` for a gVisor /
  Firecracker / Kata runner (production-grade isolation) is an impl swap behind the same
  Protocol, zero change to the tool, the grader, or callers. Limits (mem/cpu/pids/wall-clock/
  output cap) are `Settings` fields, not constants.
- **Single source of imports:** `infra`/runner is the **only** file importing `docker`. The
  tool function, schemas, and seam Protocol stay import-light so the module imports without the
  SDK (tests drive the function directly with fakes — same as `app/tools.py` today).

---

## File structure (new + modified)

```
src/mcp-capability/app/
  config.py                       (+sandbox_* limits: mem_mb, cpus, pids, wall_clock_s_max, output_cap_bytes, supported langs)
  schemas.py                      (+TestCase, CaseResult, RunResult, SandboxError)
  seams/
    code_runner.py                (NEW — CodeRunner Protocol + FakeCodeRunner)
    __init__.py                   (+export CodeRunner, FakeCodeRunner, DockerCodeRunner)
  infra/                          (NEW package — heavy-dep impls, isolated)
    __init__.py
    docker_code_runner.py         (NEW — the ONLY file importing `docker`)
  tools.py                        (+run_code(language, source, test_cases, *, runner, ...) boundary validation)
  server.py                       (+@mcp.tool() run_code; lazy DockerCodeRunner build in _ensure_* path)

src/mcp-capability/tests/
  test_run_code.py                (NEW — tool function with FakeCodeRunner)
  test_seams.py                   (+FakeCodeRunner determinism/scripting cases)

docker/
  sandbox-python.Dockerfile       (NEW — python:3.12-slim @digest → sandbox-python:pinned; non-root user, frozen stdlib)
  sandbox-node.Dockerfile         (NEW — node:22-slim @digest → sandbox-node:pinned; non-root user, frozen stdlib)

src/ai-agents/app/infra/mcp_capability.py   (+run_code(...) client method)
src/ai-agents/tests/test_mcp_clients.py     (+run_code client passthrough test)
```

**Responsibilities (one job each):** `schemas.py` = typed I/O + `SandboxError` (no docker).
`seams/code_runner.py` = the Protocol + `FakeCodeRunner` (no docker). `tools.py::run_code` =
boundary validation + delegate (no docker). `infra/docker_code_runner.py` = the **only** docker
import; container lifecycle + the STOP-SHIP flags. `server.py` = wiring + lazy build. This keeps
the testable logic free of Docker so the gate stays offline + container-free.

---

## TIER A — contract + fake + tool boundary (all offline; the gate never runs a container)

### Task 1 — schemas + SandboxError (TDD)
**Files:** Modify `src/mcp-capability/app/schemas.py`; Test `tests/test_run_code.py`.
**Produces:** `TestCase{stdin:str, expected:str, hidden:bool=False, weight:float=1.0}`,
`CaseResult{hidden:bool, passed:bool, status:Literal["ok","wrong","timeout","oom","error"], stdout_truncated:str, duration_ms:int}`,
`RunResult{compile_ok:bool=True, compile_error:str="", cases:list[CaseResult]}`,
`class SandboxError(Exception)`.
- [ ] **Step 1 — failing test:** import the models from `app.schemas`; assert a `RunResult` with
  two `CaseResult`s round-trips `model_dump`/`model_validate` and that `status` rejects an
  out-of-enum value. Run `(cd src/mcp-capability && ../../.venv/bin/python -m pytest tests/test_run_code.py -v)` → FAIL (models missing).
- [ ] **Step 2 — implement** the Pydantic models + `SandboxError` in `schemas.py` (no docker).
- [ ] **Step 3 — run → PASS.** Gate: `bash scripts/check.sh` green (models are import-only).

### Task 2 — CodeRunner Protocol + FakeCodeRunner (TDD)
**Files:** Create `src/mcp-capability/app/seams/code_runner.py`; Modify `seams/__init__.py`;
Test `tests/test_seams.py`.
**Produces:**
```python
class CodeRunner(Protocol):
    async def run(self, *, language: str, source: str, test_cases: list[TestCase]) -> RunResult: ...

class FakeCodeRunner:
    """Deterministic offline runner. Scripts per-case outcomes so graders are tested
    without Docker. Default: every case 'ok'."""
    def __init__(self, *, compile_ok=True, outcomes=None): ...   # outcomes: list[status] | callable(source)->RunResult
    async def run(self, *, language, source, test_cases): ...    # builds RunResult from the script
```
- [ ] **Step 1 — failing test** (mirror `test_seams.py` fake tests): `FakeCodeRunner()` over 3
  cases → all `ok`, `compile_ok=True`; `FakeCodeRunner(outcomes=["ok","wrong","timeout"])` →
  matching per-case `status`/`passed`; `FakeCodeRunner(compile_ok=False)` → empty `cases`. Run → FAIL.
- [ ] **Step 2 — implement** the Protocol (no third-party import) + `FakeCodeRunner` (pure,
  echoes each case's `hidden`). Export all three names from `seams/__init__.py`.
- [ ] **Step 3 — run → PASS.** Gate green.

### Task 3 — run_code tool function + boundary validation (TDD)
**Files:** Modify `src/mcp-capability/app/tools.py`, `config.py`; Test `tests/test_run_code.py`.
**Produces:** `async def run_code(language, source, test_cases, *, runner, settings) -> RunResult`.
- [ ] **Step 1 — config:** add to `Settings` (mirror existing fields):
  `sandbox_languages: list[str] = ["python", "javascript"]`, `sandbox_max_source_bytes: int =
  64_000`, `sandbox_max_cases: int = 50`, `sandbox_memory_mb: int = 256`, `sandbox_cpus: float =
  0.5`, `sandbox_pids_limit: int = 64`, `sandbox_wall_clock_s_max: int = 15`,
  `sandbox_output_cap_bytes: int = 64_000`.
- [ ] **Step 2 — failing tests** (with `FakeCodeRunner`): unsupported language → `ValueError`;
  `source` over `max_source_bytes` → `ValueError` (raised **before** `runner.run` is called —
  assert the fake's `run` was not awaited); > `max_cases` → `ValueError`; a well-formed call
  forwards validated `TestCase`s and returns the runner's `RunResult`; a `runner` that raises
  `SandboxError` propagates it (infra-failure boundary). Run → FAIL.
- [ ] **Step 3 — implement** `run_code` in `tools.py`:
```python
async def run_code(language, source, test_cases, *, runner, settings):
    if language not in settings.sandbox_languages:        # untrusted-input boundary
        raise ValueError(f"unsupported language: {language}")
    if len(source.encode()) > settings.sandbox_max_source_bytes:
        raise ValueError("source too large")
    if len(test_cases) > settings.sandbox_max_cases:
        raise ValueError("too many test cases")
    cases = [TestCase(**tc) for tc in test_cases]          # validate shape at the boundary
    return await runner.run(language=language, source=source, test_cases=cases)
```
- [ ] **Step 4 — run → PASS.** Gate green (no docker import on this path).

### Task 4 — MCP tool wrapper + lazy runner build
**Files:** Modify `src/mcp-capability/app/server.py`.
- [ ] **Step 1 — lazy build:** in the existing lazy-seam path (the `_ensure_rag()` double-checked
  lock, or a sibling `_ensure_sandbox()`), construct `DockerCodeRunner(settings=_settings)` once.
  Keep the import of `DockerCodeRunner` **call-local / inside the builder** so importing
  `server.py` needs no docker SDK (mirrors how seams keep heavy imports out of import time).
- [ ] **Step 2 — `@mcp.tool()` wrapper:**
```python
@mcp.tool()
async def run_code(language: str, source: str, test_cases: list[dict]) -> dict:
    """Run candidate code against test cases in an isolated sandbox; per-case results."""
    runner = await _ensure_sandbox()
    result = await _run_code(language, source, test_cases, runner=runner, settings=_settings)
    return result.model_dump()
```
- [ ] **Step 3 — gate green.** (No server unit test for the live tool — wiring; the function is
  unit-tested in Task 3, the live path in Task 6.)

### Task 5 — ai-agents MCP client method (TDD)
**Files:** Modify `src/ai-agents/app/infra/mcp_capability.py`; Test `tests/test_mcp_clients.py`.
- [ ] **Step 1 — failing test** (mirror existing `McpCapability` passthrough tests with a fake
  session): `McpCapability(fake_session).run_code("python", "print(1)", [...])` calls
  `call_tool("run_code", {...})` and returns the unwrapped dict. Run → FAIL.
- [ ] **Step 2 — implement:**
```python
async def run_code(self, language, source, test_cases):
    return unwrap(await self._session.call_tool(
        "run_code",
        {"language": language, "source": source, "test_cases": test_cases},
    ))
```
- [ ] **Step 3 — run → PASS.** Gate green. (This is the method the assessments `grade_coding`
  grader will call — the cross-spec coupling point.)

---

## TIER B — the live Docker runner (NOT in the gate; integration-verified)

### Task 6 — DockerCodeRunner + language images (integration)
**Files:** Create `src/mcp-capability/app/infra/__init__.py`,
`src/mcp-capability/app/infra/docker_code_runner.py`; Create `docker/sandbox-python.Dockerfile`,
`docker/sandbox-node.Dockerfile`.
- [ ] **Step 1 — images:** exact bases **`python:3.12-slim`** and **`node:22-slim`**, each **pinned
  by digest** (not a floating tag), rebuilt into `sandbox-python:pinned` / `sandbox-node:pinned`
  with a **non-root** user (S3), no shell tools beyond the interpreter, frozen stdlib (no
  network/package install at run time — the build is network-on, run **once at deploy**, never at
  submit). Document the build in `docker/` (`docker build -f docker/sandbox-python.Dockerfile -t
  sandbox-python:pinned .`; same for node). The **language→image map** (Task 6 Step 2) is the one
  place a third language (Java/Go) attaches — one image + one row, no contract change; default
  limits are shared with an **optional per-language override** seam (spec §3.5).
- [ ] **Step 2 — `DockerCodeRunner.run`** (the ONLY file importing `docker`): dispatch on
  `language` via the **language→image map** (`{"python": ("sandbox-python:pinned", ["python",
  "/code/main.py"]), "javascript": ("sandbox-node:pinned", ["node", "/code/main.js"])}`, spec
  §3.5). Per test case, one fresh container with **every** STOP-SHIP flag (S1–S6) set on
  `containers.run(... detach=True, network_disabled=True, read_only=True, mem_limit="256m",
  memswap_limit="256m", nano_cpus=..., pids_limit=64, cap_drop=["ALL"],
  security_opt=["no-new-privileges"], user="<nonroot>", tmpfs={"/tmp": "..."}, volumes={src_dir:
  {"bind": "/code", "mode": "ro"}})`); feed `stdin`; enforce **host-side** wall-clock via
  `asyncio.wait_for` around the wait/log read, killing the container on timeout (S7); read **≤
  `settings.sandbox_output_cap_bytes` (64 KB)** of stdout+stderr combined, **truncating** with a
  `…[output truncated at 64 KB]` marker and comparing the **truncated** bytes to `expected` (so
  over-print ≠ a spurious match) (S8, §3.3); classify ok/wrong/timeout/oom/error per the **error
  taxonomy** (§3.6): clean exit + match → `ok`; clean exit + mismatch → `wrong`; wall-clock kill →
  `timeout`; OOM-killed *during* the run → `oom`; non-zero exit / decode failure → `error`.
  **`finally`: `container.kill()` + `container.remove(force=True)` + delete the temp dir** (S9),
  tolerating already-gone. One container per case (S10) — never reuse. **Error-taxonomy boundary
  (explicit, §3.6):** a container that **fails to create/start** (daemon down, **image missing**,
  create error) → raise **`SandboxError`** (infra); the candidate's process crashing **after**
  start → a `CaseResult{status="error"|"oom"}` (candidate data, NOT an exception). Wrap daemon/SDK
  calls in try/except → `SandboxError` (+ structured log); transient daemon errors get a bounded
  retry, **candidate timeouts/OOM/crashes do not** (they are `CaseResult`s).
- [ ] **Step 3 — integration verification (manual, NOT the gate):**
  - Known-good Python solution → all cases `ok`; output matches.
  - `while True: pass` → `timeout` (proves S7 host-side kill, not an in-container limit).
  - Fork bomb (`os.fork` loop) → bounded by S6 then reaped (no host impact).
  - `socket.create_connection(("1.1.1.1", 53))` / `fetch` → fails closed (proves S1).
  - Write to `/code` or `/etc` → read-only failure; write to `/tmp` → vanishes with the
    container (proves S2).
  - `print("x" * 10**9)` → truncated at **64 KB** with the `…[output truncated at 64 KB]` marker,
    no host memory blowup (S8); the truncated output does **not** spuriously match a short
    `expected`.
  - **Error-taxonomy boundary:** point the runner at a **missing image** → raises `SandboxError`
    (infra), NOT a `CaseResult`; a candidate program that exits non-zero / segfaults **after start**
    → `CaseResult{status="error"}` (candidate data), NOT a `SandboxError` (§3.6).
  - **`test_no_leftover_containers` (one-container-per-run, S9/S10):** snapshot `docker ps -aq
    --filter name=sandbox-` before a multi-case run, run to completion (mixed ok/timeout/oom), then
    assert the after-snapshot **equals** the before-snapshot (zero leftovers); repeat after a
    **cancelled** `run` (cancel mid-case) to prove the `finally` reap fires under cancellation.
  - **`test_sandbox_no_cross_tenant_leak` (cross-tenant isolation):** run A (one `comp_id`) writes
    a `/tmp` marker + opens a socket; run B (a **different `comp_id`**, back-to-back) reads `/tmp`
    and the network → assert run B sees **no file from run A** (fresh tmpfs scratch, S2/S10) and
    **no network reachability** (`--network=none`, S1) ⇒ **no shared state** between tenants.
  - JS path: a known-good Node solution → `ok`.
- [ ] **Step 4 — gate:** `bash scripts/check.sh` green — confirm the gate **did not** start a
  container (the live runner is never instantiated in unit tests; `FakeCodeRunner` is the
  default everywhere).

---

## Verification (end-to-end)
1. **Per task:** `bash scripts/check.sh` GREEN (grows from **423**). The gate is
   **container-free** — Docker is exercised only in Task 6's manual checks.
2. **Boundary:** `test_run_code.py` proves the language allow-list, source-size cap, and
   case-count cap reject **before** any runner call, and that `SandboxError` propagates as
   infra-failure (distinct from candidate failure).
3. **Contract (offline):** `test_seams.py` proves `FakeCodeRunner` scripts per-case outcomes
   deterministically (the foundation the assessments `grade_coding` tests build on).
4. **Client passthrough:** `test_mcp_clients.py` proves `McpCapability.run_code` calls the tool
   and unwraps — the consumption point for assessments.
5. **STOP-SHIP invariants (manual/integration):** S1–S10 each demonstrated in Task 6
   (network-off, host-FS-off, non-root, mem/cpu/pids bounded, host-side wall-clock kill, output
   cap **at 64 KB with truncation marker**, always-reaped, one-container-per-run). The build is
   **not done** until every invariant is shown. Includes the named **`test_no_leftover_containers`**
   (before/after `docker ps` equal — S9/S10, incl. under cancellation) and
   **`test_sandbox_no_cross_tenant_leak`** (run B sees no `/tmp` marker + no network from run A).
6. **Error taxonomy (Task 6):** a **missing image / container-create failure → `SandboxError`**
   (infra), while a candidate process crashing after start → `CaseResult{status="error"|"oom"}`
   (data) — the boundary the grader relies on to never score an outage as a failing candidate.

## Resolved gaps (completeness audit 2026-06-19)

Resolving `2026-06-19-v2-completeness-audit.md` (Part B → "Inc 2 — Code Execution Sandbox"). Each
is now a concrete `- [ ]` task above:

- **Output cap** → Task 3 config (`sandbox_output_cap_bytes = 64_000`) + Task 6 Step 2 (read ≤
  **64 KB** stdout+stderr, **truncate** with the `…[output truncated at 64 KB]` marker, compare
  truncated bytes) (S8).
- **Language→image map** → Task 6 Step 1 (exact `python:3.12-slim` / `node:22-slim`, **digest-pinned**,
  rebuilt non-root + frozen stdlib, built once at deploy) + Step 2 (the dispatch map
  `language → (image, run-cmd)`; shared limits with a per-language override seam).
- **Error taxonomy** → Task 6 Step 2 + the integration check: **missing image / create failure →
  `SandboxError`** (infra); candidate crash after start → `CaseResult{status="error"|"oom"}`
  (data). Container-crash boundary classified ("did the sandbox come up?").
- **One-container-per-run assertion** → Task 6 Step 3 **`test_no_leftover_containers`**
  (before/after `docker ps` snapshots equal, incl. under cancellation) (S9/S10).
- **Cross-tenant isolation test** → Task 6 Step 3 **`test_sandbox_no_cross_tenant_leak`**
  (network-off + fresh tmpfs scratch ⇒ run B sees no state from run A's different `comp_id`).

## Risks / re-verify at execution
- **In-container vs host-side timeout (S7).** The wall-clock kill MUST be host-side
  (`asyncio.wait_for` + `container.kill()`); an in-container `timeout`/`ulimit` is untrusted code
  and can be evaded. Re-confirm the kill fires on a tight `while True`.
- **Docker Desktop on macOS limits.** Confirm `network_disabled`, `read_only`, `pids_limit`,
  `nano_cpus`, and `mem_limit`/`memswap_limit` behave as expected on the local Docker engine; OOM
  must surface as `oom` (not a silent kill). `--memory-swap == --memory` disables swap (else the
  memory cap is soft).
- **Container reaping under cancellation.** The `finally` reap must run even if the MCP call is
  cancelled mid-run; verify a cancelled `run` leaves no container (`docker ps -a`).
- **Image supply.** Pin image digests; document the local build. Frozen offline stdlib only — no
  package install at submit time (a network-on build step, run once, never at run time).
- **Upgrade path.** If the personal/demo isolation floor (plain Docker) is later deployed to a
  hostile multi-tenant environment, swap `DockerCodeRunner` → a gVisor/Firecracker/Kata runner
  behind the same `CodeRunner` Protocol — no change to the tool, grader, or callers.
