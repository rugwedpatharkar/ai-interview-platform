# A6 — Internal Coding-Assessment Execution Implementation Plan

> **STATUS: IMPLEMENTED (2026-06-20)** — all 9 tasks landed (`429c68a`..`837e7a3`),
> full gate green. Executor (`lib/lib/execution/`), `admin.coding.v1.CodingService`,
> typed grading, attempt persistence + eraser, static seed, and the deploy-layer
> isolation manifests + `A6-EXECUTION-SECURITY.md`. Remaining: the FE quad + screen
> flip (separate FE session) and the gated LLM-authoring follow-up.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a candidate run and submit code in the assessment screen and have it executed + graded **inside our own services** — no hosted code-exec API, no self-hosted sandbox VM/container — using only the Python standard library, plus typed-section grading.

**Architecture:** A stdlib-only hardened-subprocess executor in `lib` runs untrusted candidate code as a resource-limited child process (CPU/mem/output rlimits, scrubbed environment, isolated temp cwd, wall-clock kill of the process group). A new `admin.coding.v1.CodingService` (candidate-owned, mirrors `AptitudeService`) exposes `GetCodingTask` / `RunCode` (ephemeral) / `SubmitCoding` (runs hidden test cases + grades typed answers, persists the attempt, emits `coding.graded`). Hidden test cases and accepted typed answers never leave the server.

**Tech Stack:** Python 3.14, stdlib `asyncio`/`subprocess`/`resource`/`signal`/`tempfile` (executor), Motor/MongoDB (tasks + attempts), grpc-web (`GrpcWebASGI`), the existing `_owned` candidate authz + `RateLimiter`, protobuf/`grpc_tools.protoc` + `pnpm gen`.

## Security model (read before Task 1)

Running candidate code is the most hostile input on the platform. The isolation is split in two — **this plan builds the code-level half; the deploy-level half is a documented operational requirement (Task 9), not new application code or a new dependency.**

| Layer | Control | Built where |
|---|---|---|
| **Code** | CPU (`RLIMIT_CPU`), memory (`RLIMIT_AS`), output/file size (`RLIMIT_FSIZE`), no core dumps (`RLIMIT_CORE=0`), fork-bomb backstop (`RLIMIT_NPROC`) | Task 1 |
| **Code** | **Scrubbed env** — child gets only `PATH`/`HOME`/`LANG`, never a secret | Task 1 |
| **Code** | Isolated temp cwd, own session, wall-clock `SIGKILL` of the whole group | Task 1 |
| **Deploy** | Deny-all-egress `NetworkPolicy` (L3/L4 — stdlib alone cannot) | Task 9 (yaml + docs) |
| **Deploy** | **seccomp profile denying the `socket` syscall family** (syscall-level network denial, **no privilege**) | Task 9 (profile + docs) |
| **Deploy** | **Unprivileged, non-root** executor (`runAsNonRoot`, `allowPrivilegeEscalation: false`, drop ALL caps) | Task 9 (docs) |
| **Deploy** | Secrets provided as **env only**, never file mounts the child can read | Task 9 (docs) |
| **Deploy (optional)** | Run the executor in a dedicated Deployment of the **same image** (no new code), secret-free, deny-egress | Task 9 (note) |

**Decided (2026-06-20):** network isolation is the **deploy-layer** posture — a deny-egress `NetworkPolicy` **plus a pod seccomp profile that denies the `socket` syscall family**, both on an **unprivileged, non-root** executor. Rejected: code-level Linux network namespaces (`unshare(CLONE_NEWNET)`), because they need a privileged worker — running attacker-controlled code in a privileged process expands the blast radius of any escape far more than the egress it blocks. Seccomp deny-socket gives syscall-level network denial with **no privilege**, strictly better than namespaces. Caveat: `NetworkPolicy` is only enforced by a CNI that supports it (Calico/Cilium, not flannel alone) — verify + assert at deploy (Task 9). Off-k8s, use host egress-firewall rules, never privileged namespaces.

## Global Constraints

Copied verbatim from the project conventions — **every task below implicitly includes these**:

- **No new third-party dependency.** The executor is **stdlib only** (`asyncio`, `subprocess`, `resource`, `signal`, `tempfile`, `os`, `time`). Adding any runtime/sandbox library voids the "internal, no new dependency" requirement and needs separate sign-off.
- **POSIX only.** The executor uses `preexec_fn` + `resource.setrlimit` + `os.killpg`; it raises on non-POSIX hosts. Dev on macOS works for tests; production is Linux. `RLIMIT_AS` and `RLIMIT_NPROC` are coarse (per-UID for NPROC) — the authoritative mem/PID caps are cgroups at deploy (Task 9).
- **Gate (must be GREEN before every push):** `bash scripts/check.sh`. Run `.venv/bin/ruff check <files>` AND `.venv/bin/ruff format --check <files>` per file before committing; **every docstring/comment line ≤ 88 chars** (ruff format does not wrap prose → E501). A `PostToolUse` hook strips not-yet-used imports — **add the usage before the import**.
- **venv:** `/Users/rugwedpatharkar/Projects/Project/.venv`. Run as `../../.venv/bin/python` from a service dir or `.venv/bin/python` from root.
- **Branch + commits:** work on the current branch; **commit per task with EXPLICIT paths** (`git add <files>`, never `git add -A`; verify `git diff --cached --name-only`). Pass paths literally (zsh does not word-split unquoted vars). Footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push only when the gate is green.
- **Python codegen (admin):** from `src/admin/`: `../../.venv/bin/python -m grpc_tools.protoc -I . --python_out=. --grpc_python_out=. --pyi_out=. app/routes/pb/coding.proto` — commit the generated `_pb2.py/.pyi/_pb2_grpc.py`. `**/pb` is ruff-excluded.
- **FE codegen:** after the new `.proto`, from `frontend/`: `npx pnpm@9.15.0 --filter @ip/api-client gen` — commit only the changed `frontend/packages/api-client/src/gen/coding_pb.ts`. The `index.ts` quad + screen flip are a **separate FE task** (Recipe R2 in `2026-06-20-v2-backend-gap-closure.md`).
- **Tenant/identity scope** ALWAYS from the token (`identity["id"]`/`identity["comp_id"]`), NEVER the request. Cross-tenant/not-owned → `NotFound`/`Forbidden` (don't leak existence).
- **Errors:** domain errors subclass `AuthDomainError` (`src/admin/app/errors.py`); already mapped in `_STATUS` (`src/admin/app/routes/auth.py`): NotFound→NOT_FOUND, Forbidden→PERMISSION_DENIED, Validation→INVALID_ARGUMENT, RateLimited→RESOURCE_EXHAUSTED, Conflict→ALREADY_EXISTS.
- **Out of scope (explicit):** funnel **gating** on coding results (whether passing advances the application) is a funnel state-machine change — this plan emits `coding.graded` for future use but does NOT alter transitions. Coding-task **authoring** (who writes the prompt + hidden cases) is assumed seeded into `coding_tasks` (a follow-up authoring contract is noted, not built).

---

## File Structure

**lib (executor — reused by any service):**
- Create `lib/lib/execution/__init__.py` — re-exports `run_code`, `ExecLimits`, `ExecResult`.
- Create `lib/lib/execution/runner.py` — the hardened-subprocess executor.
- Create `lib/tests/test_execution.py` — executor tests (real `python3` subprocess).

**admin (contract + logic):**
- Create `src/admin/app/model/coding.py` — `CodingTask`, `TestCase`, `TypedQuestion`, `CodingAttempt`.
- Create `src/admin/app/infra/repositories/coding_tasks.py` — `CodingTaskRepository.get_by_job`.
- Create `src/admin/app/infra/repositories/coding_attempts.py` — `CodingAttemptRepository.insert` + `delete_by_candidate`.
- Create `src/admin/app/resources/coding.py` — authz + validation + grading + DTO.
- Create `src/admin/app/routes/pb/coding.proto` (+ generated `coding_pb2.py/.pyi/_pb2_grpc.py`).
- Create `src/admin/app/routes/coding.py` — thin servicer.
- Modify `src/admin/app/routes/web.py` — register `CodingServicer`; add to `make_eraser`.
- Modify `src/admin/app/resources/compliance.py` — eraser cascade for `coding_attempts`.
- Modify `src/admin/app/infra/db.py` — `INDEXES` for `coding_tasks` + `coding_attempts`.
- Modify `src/admin/tests/conftest.py` — fakes for the new repos + eraser wiring.
- Create `src/admin/tests/test_resources_coding.py`, `src/admin/tests/test_coding_grpc.py`.
- Modify `src/admin/tests/test_web.py` — service-count bump + method assert.

**FE codegen + deploy docs:**
- Modify `frontend/packages/api-client/src/gen/coding_pb.ts` (generated).
- Create `deploy/coding-executor-networkpolicy.yaml` + `docs/superpowers/plans/A6-EXECUTION-SECURITY.md`.

---

## Task 1: Hardened subprocess executor (lib, stdlib only)

**Files:**
- Create: `lib/lib/execution/runner.py`, `lib/lib/execution/__init__.py`
- Test: `lib/tests/test_execution.py`

**Interfaces:**
- Produces: `run_code(language: str, source: str, stdin: str = "", *, limits: ExecLimits = ExecLimits()) -> ExecResult` (async). `ExecLimits(cpu_seconds:int=2, mem_bytes:int=512*1024*1024, wall_seconds:float=5.0, output_bytes:int=64*1024, nproc:int=64)`. `ExecResult(stdout:str, stderr:str, exit_code:int, time_ms:int, timed_out:bool)`. Supported `language`: `"python"`.

- [ ] **Step 1: Write the failing tests** (`lib/tests/test_execution.py`)

```python
import os

import pytest

from lib.execution import ExecLimits, run_code

posix_only = pytest.mark.skipif(os.name != "posix", reason="executor is POSIX-only")


@posix_only
async def test_runs_and_captures_stdout():
    r = await run_code("python", "print(1 + 2)")
    assert r.stdout.strip() == "3"
    assert r.exit_code == 0 and r.timed_out is False


@posix_only
async def test_feeds_stdin():
    r = await run_code("python", "import sys; print(sys.stdin.read().upper())", "hi")
    assert r.stdout.strip() == "HI"


@posix_only
async def test_nonzero_exit_propagates():
    r = await run_code("python", "raise SystemExit(3)")
    assert r.exit_code == 3


@posix_only
async def test_wall_timeout_kills():
    r = await run_code(
        "python", "import time; time.sleep(30)", limits=ExecLimits(wall_seconds=0.5)
    )
    assert r.timed_out is True and r.exit_code != 0


@posix_only
async def test_environment_is_scrubbed_of_secrets(monkeypatch):
    # A secret in the PARENT env must never be visible to the child.
    monkeypatch.setenv("JWT_SECRET", "super-secret")
    r = await run_code("python", "import os; print(os.environ.get('JWT_SECRET', 'NONE'))")
    assert r.stdout.strip() == "NONE"


@posix_only
async def test_output_is_truncated():
    r = await run_code(
        "python", "print('x' * 1000)", limits=ExecLimits(output_bytes=100)
    )
    assert len(r.stdout) <= 100


@posix_only
async def test_unsupported_language_raises():
    with pytest.raises(ValueError):
        await run_code("rust", "fn main(){}")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd lib && ../../.venv/bin/python -m pytest tests/test_execution.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.execution'`.

- [ ] **Step 3: Implement the executor** (`lib/lib/execution/runner.py`)

```python
"""Hardened in-process code executor — runs untrusted candidate code as a
resource-limited subprocess. Stdlib only; no hosted API, no container.

SECURITY MODEL (read before editing):
- CODE LEVEL (this module): the child runs with CPU/mem/output rlimits, a hard
  wall-clock kill, an environment scrubbed of every secret (only PATH/HOME/LANG),
  an isolated temp cwd, and its own session so the whole tree can be killed. A
  crash, OOM, or infinite loop cannot take down the parent.
- DEPLOY LEVEL (NOT here — see A6-EXECUTION-SECURITY.md): this module does NOT block
  network or arbitrary filesystem reads. Run it where (a) secrets are env-only (the
  scrub then protects them) and never file-mounted, and (b) a deny-all-egress
  NetworkPolicy is in force. POSIX only (preexec_fn / rlimits / killpg).
"""

import asyncio
import os
import resource
import signal
import sys
import tempfile
import time
from dataclasses import dataclass

from lib.logging import get_logger

log = get_logger(component="execution")


@dataclass(frozen=True)
class ExecLimits:
    cpu_seconds: int = 2  # RLIMIT_CPU (CPU time, not wall)
    mem_bytes: int = 512 * 1024 * 1024  # RLIMIT_AS — coarse; cgroup is authoritative
    wall_seconds: float = 5.0  # parent-enforced wall clock → SIGKILL the group
    output_bytes: int = 64 * 1024  # captured stdout/stderr cap + RLIMIT_FSIZE
    nproc: int = 64  # RLIMIT_NPROC fork-bomb backstop (per-UID — see docs)


@dataclass(frozen=True)
class ExecResult:
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int
    timed_out: bool


# Whitelisted runtimes only — resolved to an absolute interpreter path so the child
# needs no inherited PATH. Add languages HERE, never from the request.
_LANGS: dict[str, list[str]] = {"python": [sys.executable, "-I", "-S"]}


def _apply_limits(limits: ExecLimits):
    # Runs in the child between fork and exec (POSIX). Any raise here aborts the exec.
    def _preexec():
        resource.setrlimit(
            resource.RLIMIT_CPU, (limits.cpu_seconds, limits.cpu_seconds)
        )
        resource.setrlimit(resource.RLIMIT_AS, (limits.mem_bytes, limits.mem_bytes))
        resource.setrlimit(
            resource.RLIMIT_FSIZE, (limits.output_bytes, limits.output_bytes)
        )
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_NPROC, (limits.nproc, limits.nproc))

    return _preexec


def _truncate(b: bytes, n: int) -> str:
    return b[:n].decode("utf-8", "replace")


async def run_code(
    language: str, source: str, stdin: str = "", *, limits: ExecLimits = ExecLimits()
) -> ExecResult:
    if os.name != "posix":
        raise RuntimeError("code execution requires a POSIX host")
    argv = _LANGS.get(language)
    if argv is None:
        raise ValueError(f"unsupported language: {language}")
    with tempfile.TemporaryDirectory(prefix="exec-") as tmp:
        src_path = os.path.join(tmp, "main.py")
        with open(src_path, "w") as f:
            f.write(source)
        # Scrubbed env: only what an interpreter needs — NO inherited secrets.
        env = {"PATH": "/usr/bin:/bin", "HOME": tmp, "LANG": "C.UTF-8"}
        t0 = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            *argv,
            src_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=tmp,
            env=env,
            preexec_fn=_apply_limits(limits),
            start_new_session=True,  # own process group → killpg on timeout
        )
        timed_out = False
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(input=stdin.encode()), timeout=limits.wall_seconds
            )
        except (TimeoutError, asyncio.TimeoutError):
            timed_out = True
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            out, err = await proc.communicate()
        time_ms = int((time.monotonic() - t0) * 1000)
        code = proc.returncode if proc.returncode is not None else -1
        return ExecResult(
            stdout=_truncate(out or b"", limits.output_bytes),
            stderr=_truncate(err or b"", limits.output_bytes),
            exit_code=code,
            time_ms=time_ms,
            timed_out=timed_out,
        )
```

And `lib/lib/execution/__init__.py`:

```python
from lib.execution.runner import ExecLimits, ExecResult, run_code

__all__ = ["ExecLimits", "ExecResult", "run_code"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd lib && ../../.venv/bin/python -m pytest tests/test_execution.py -q`
Expected: PASS (7 passed; skipped on non-POSIX).

- [ ] **Step 5: Lint + commit**

```bash
cd /Users/rugwedpatharkar/Projects/Project
.venv/bin/ruff check lib/lib/execution lib/tests/test_execution.py
.venv/bin/ruff format --check lib/lib/execution lib/tests/test_execution.py
git add lib/lib/execution/runner.py lib/lib/execution/__init__.py lib/tests/test_execution.py
git commit -m "feat(execution): stdlib hardened-subprocess code executor (A6.1)"
```

---

## Task 2: Coding model + repositories + indexes (admin)

**Files:**
- Create: `src/admin/app/model/coding.py`, `src/admin/app/infra/repositories/coding_tasks.py`, `src/admin/app/infra/repositories/coding_attempts.py`
- Modify: `src/admin/app/infra/db.py`
- Test: `src/admin/tests/test_resources_coding.py` (repo-shape asserts arrive with Task 3)

**Interfaces:**
- Produces: `CodingTask(job_id, title, prompt, languages: list[str], starter_code, sample_cases: list[TestCase], hidden_cases: list[TestCase], typed_questions: list[TypedQuestion], cpu_seconds:int=2, wall_seconds:int=5)`; `TestCase(stdin, expected_stdout)`; `TypedQuestion(id, prompt, accepted: list[str])`; `CodingAttempt(application_id, comp_id, candidate_user_id, job_id, cases_passed, cases_total, typed_correct, typed_total, passed, created_at)`. `CodingTaskRepository.get_by_job(job_id) -> dict|None`; `CodingAttemptRepository.insert(attempt) -> None`, `.delete_by_candidate(candidate_user_id) -> int`.

- [ ] **Step 1: Write the model** (`src/admin/app/model/coding.py`)

```python
from datetime import UTC, datetime

from pydantic import BaseModel, Field


class TestCase(BaseModel):
    stdin: str = ""
    expected_stdout: str = ""


class TypedQuestion(BaseModel):
    id: str
    prompt: str
    accepted: list[str] = Field(default_factory=list)  # normalized-match answer key


class CodingTask(BaseModel):
    job_id: str
    title: str = ""
    prompt: str = ""
    languages: list[str] = Field(default_factory=lambda: ["python"])
    starter_code: str = ""
    sample_cases: list[TestCase] = Field(default_factory=list)  # shown to candidate
    hidden_cases: list[TestCase] = Field(default_factory=list)  # grading — never sent
    typed_questions: list[TypedQuestion] = Field(default_factory=list)
    cpu_seconds: int = 2
    wall_seconds: int = 5


class CodingAttempt(BaseModel):
    application_id: str
    comp_id: str
    candidate_user_id: str
    job_id: str
    cases_passed: int
    cases_total: int
    typed_correct: int
    typed_total: int
    passed: bool
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
```

- [ ] **Step 2: Write the repositories**

`src/admin/app/infra/repositories/coding_tasks.py` (mirror `aptitude_banks.py` — read by `job_id`):

```python
class CodingTaskRepository:
    def __init__(self, db):
        self._col = db["coding_tasks"]

    async def get_by_job(self, job_id: str):
        return await self._col.find_one({"job_id": job_id})
```

`src/admin/app/infra/repositories/coding_attempts.py` (mirror `aptitude_attempts.py`):

```python
from app.model.coding import CodingAttempt


class CodingAttemptRepository:
    def __init__(self, db):
        self._col = db["coding_attempts"]

    async def insert(self, attempt: CodingAttempt) -> None:
        await self._col.insert_one(attempt.model_dump())

    async def delete_by_candidate(self, candidate_user_id: str) -> int:
        result = await self._col.delete_many({"candidate_user_id": candidate_user_id})
        return result.deleted_count
```

- [ ] **Step 3: Add indexes** (`src/admin/app/infra/db.py` — append to `INDEXES`, mirror the aptitude entries)

```python
# Coding assessment: task by job; one attempt per application; candidate erase.
("coding_tasks", [("job_id", 1)], {"unique": True}),
("coding_attempts", [("application_id", 1)], {"unique": True}),
("coding_attempts", [("candidate_user_id", 1)], {}),
```

(Match the exact tuple/kwargs shape already used in `INDEXES` — adjust if the file uses `IndexModel`.)

- [ ] **Step 4: Verify it imports + lint**

Run: `cd src/admin && ../../.venv/bin/python -c "from app.model.coding import CodingTask, CodingAttempt; from app.infra.repositories.coding_tasks import CodingTaskRepository; from app.infra.repositories.coding_attempts import CodingAttemptRepository; print('ok')"`
Then: `.venv/bin/ruff check src/admin/app/model/coding.py src/admin/app/infra/repositories/coding_tasks.py src/admin/app/infra/repositories/coding_attempts.py src/admin/app/infra/db.py`
Expected: `ok` + clean.

- [ ] **Step 5: Commit**

```bash
git add src/admin/app/model/coding.py src/admin/app/infra/repositories/coding_tasks.py src/admin/app/infra/repositories/coding_attempts.py src/admin/app/infra/db.py
git commit -m "feat(coding): CodingTask/CodingAttempt model + repos + indexes (A6.2)"
```

---

## Task 3: Coding resource — GetCodingTask + grading helpers (admin, TDD)

**Files:**
- Create: `src/admin/app/resources/coding.py`
- Test: `src/admin/tests/test_resources_coding.py`

**Interfaces:**
- Consumes: `_owned` pattern from `aptitude.py`; `CodingTaskRepository.get_by_job`.
- Produces: `get_coding_task(identity, application_id, *, applications, tasks) -> dict` (DTO with `sample_cases` only — NO hidden cases, NO typed `accepted`). Helpers `_normalize(s) -> str`, `_grade_case(result, expected) -> bool`.

- [ ] **Step 1: Write the failing tests** (`src/admin/tests/test_resources_coding.py`)

```python
import pytest

from app.errors import ForbiddenError, NotFoundError
from app.resources import coding
from app.resources.coding import _grade_case, _normalize


def _identity(uid="cand", comp_id="c1"):
    return {"id": uid, "role": "candidate", "comp_id": comp_id}


class _Apps:
    def __init__(self, app):
        self._app = app

    async def get(self, aid):
        return self._app


class _Tasks:
    def __init__(self, task):
        self._task = task

    async def get_by_job(self, job_id):
        return self._task


def _app(uid="cand"):
    return {"_id": "a1", "comp_id": "c1", "candidate_user_id": uid, "job_id": "j1"}


def _task():
    return {
        "job_id": "j1",
        "title": "Sum",
        "prompt": "Read two ints, print their sum.",
        "languages": ["python"],
        "starter_code": "",
        "sample_cases": [{"stdin": "1 2", "expected_stdout": "3"}],
        "hidden_cases": [{"stdin": "4 5", "expected_stdout": "9"}],
        "typed_questions": [{"id": "t1", "prompt": "Big-O?", "accepted": ["O(1)"]}],
        "cpu_seconds": 2,
        "wall_seconds": 5,
    }


async def test_get_task_hides_answer_key():
    dto = await coding.get_coding_task(
        _identity(), "a1", applications=_Apps(_app()), tasks=_Tasks(_task())
    )
    assert dto["title"] == "Sum"
    assert dto["sample_cases"] == [{"stdin": "1 2", "expected_stdout": "3"}]
    # Hidden cases + typed accepted answers must NEVER reach the candidate.
    assert "hidden_cases" not in dto
    assert dto["typed_questions"] == [{"id": "t1", "prompt": "Big-O?"}]


async def test_get_task_rejects_non_owner():
    with pytest.raises(ForbiddenError):
        await coding.get_coding_task(
            _identity(uid="other"),
            "a1",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
        )


async def test_get_task_not_ready():
    with pytest.raises(NotFoundError):
        await coding.get_coding_task(
            _identity(), "a1", applications=_Apps(_app()), tasks=_Tasks(None)
        )


def test_normalize_strips_trailing_ws_and_newlines():
    assert _normalize("3 \n\n") == _normalize("3")


def test_grade_case_requires_clean_exit_and_match():
    from lib.execution import ExecResult

    ok = ExecResult(stdout="9\n", stderr="", exit_code=0, time_ms=1, timed_out=False)
    assert _grade_case(ok, "9") is True
    crashed = ExecResult(stdout="9", stderr="", exit_code=1, time_ms=1, timed_out=False)
    assert _grade_case(crashed, "9") is False
    slow = ExecResult(stdout="9", stderr="", exit_code=0, time_ms=1, timed_out=True)
    assert _grade_case(slow, "9") is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_coding.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.resources.coding'`.

- [ ] **Step 3: Implement** (`src/admin/app/resources/coding.py` — GetCodingTask + helpers only; Run/Submit land in Task 4)

```python
"""Coding-assessment delivery + grading (transport-agnostic resources).

The candidate fetches the task (prompt + SAMPLE cases only — never the hidden answer
key), runs scratch code (ephemeral), and submits for grading against hidden test cases
+ typed answers. Execution is the stdlib lib.execution sandbox (resource-capped
subprocess). Candidate-owned via the application (the tenant source of truth).
"""

from lib.execution import run_code
from lib.logging import get_logger

from app.errors import ForbiddenError, NotFoundError
from app.resources.aptitude import _owned  # candidate-owns-application authz

log = get_logger(component="coding.resources")


def _normalize(s: str) -> str:
    return "\n".join(line.rstrip() for line in s.splitlines()).rstrip("\n")


def _grade_case(result, expected: str) -> bool:
    return (
        result.exit_code == 0
        and not result.timed_out
        and _normalize(result.stdout) == _normalize(expected)
    )


def _public_task(application_id, task):
    # Strip the answer key: hidden cases and the typed `accepted` list stay server-side.
    return {
        "application_id": application_id,
        "title": task.get("title", ""),
        "prompt": task.get("prompt", ""),
        "languages": task.get("languages", ["python"]),
        "starter_code": task.get("starter_code", ""),
        "sample_cases": task.get("sample_cases", []),
        "typed_questions": [
            {"id": q["id"], "prompt": q["prompt"]}
            for q in task.get("typed_questions", [])
        ],
        "cpu_seconds": task.get("cpu_seconds", 2),
        "wall_seconds": task.get("wall_seconds", 5),
    }


async def get_coding_task(identity, application_id, *, applications, tasks):
    application = await _owned(identity, application_id, applications)
    task = await tasks.get_by_job(application["job_id"])
    if task is None:
        raise NotFoundError("Coding task not ready")
    return _public_task(application_id, task)
```

(`_owned` raises `ForbiddenError`/`NotFoundError` exactly as the aptitude tests expect — reuse it; do not re-implement.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_coding.py -q`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
.venv/bin/ruff check src/admin/app/resources/coding.py src/admin/tests/test_resources_coding.py
git add src/admin/app/resources/coding.py src/admin/tests/test_resources_coding.py
git commit -m "feat(coding): GetCodingTask + grading helpers, answer-key hidden (A6.3)"
```

---

## Task 4: Coding resource — RunCode + SubmitCoding (admin, TDD)

**Files:**
- Modify: `src/admin/app/resources/coding.py`
- Test: `src/admin/tests/test_resources_coding.py`

**Interfaces:**
- Consumes: `lib.execution.run_code` (injected as `executor=run_code` for offline tests); `RateLimiter.hit`; `CodingAttemptRepository.insert`; a publisher.
- Produces:
  - `run_code_attempt(identity, application_id, language, source, stdin, *, applications, tasks, limiter, executor=run_code) -> dict` (`{stdout, stderr, exit_code, time_ms, timed_out}`). Validates `language in task.languages`, `len(source) <= _MAX_SOURCE`; rate-limited per candidate.
  - `submit_coding(identity, application_id, language, source, typed_answers, *, applications, tasks, attempts, publisher, limiter, executor=run_code) -> dict` (`{passed, cases_passed, cases_total, typed_correct, typed_total}`). Runs hidden cases, grades typed, persists `CodingAttempt`, emits `coding.graded`.
- Constants: `_MAX_SOURCE = 64 * 1024`, `_RUN_LIMIT = 30`, `_RUN_WINDOW = 60`.

- [ ] **Step 1: Write the failing tests** (append to `src/admin/tests/test_resources_coding.py`)

```python
from lib.execution import ExecResult

from app.errors import RateLimitedError, ValidationError
from app.model.application import Application  # noqa: F401  (only if needed by fakes)


class _Limiter:
    def __init__(self, allowed=True):
        self._allowed = allowed
        self.hits = []

    async def hit(self, key, limit, window):
        self.hits.append((key, limit, window))

        class _Hit:
            allowed = self._allowed
            retry_after = 5

        return _Hit()


class _Attempts:
    def __init__(self):
        self.inserted = []

    async def insert(self, attempt):
        self.inserted.append(attempt)


class _Pub:
    def __init__(self):
        self.events = []

    async def publish(self, key, payload):
        self.events.append((key, payload))


def _exec_returning(stdout, exit_code=0, timed_out=False):
    async def _fake(language, source, stdin="", *, limits=None):
        return ExecResult(
            stdout=stdout, stderr="", exit_code=exit_code, time_ms=1, timed_out=timed_out
        )

    return _fake


async def test_run_code_is_ephemeral():
    out = await coding.run_code_attempt(
        _identity(),
        "a1",
        "python",
        "print(1)",
        "",
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        limiter=_Limiter(),
        executor=_exec_returning("1\n"),
    )
    assert out["stdout"].strip() == "1" and out["exit_code"] == 0


async def test_run_code_rejects_unlisted_language():
    with pytest.raises(ValidationError):
        await coding.run_code_attempt(
            _identity(),
            "a1",
            "rust",
            "x",
            "",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
            limiter=_Limiter(),
            executor=_exec_returning(""),
        )


async def test_run_code_rate_limited():
    with pytest.raises(RateLimitedError):
        await coding.run_code_attempt(
            _identity(),
            "a1",
            "python",
            "print(1)",
            "",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
            limiter=_Limiter(allowed=False),
            executor=_exec_returning("1\n"),
        )


async def test_submit_grades_hidden_cases_and_typed():
    attempts, pub = _Attempts(), _Pub()
    # hidden case expects "9" for stdin "4 5"; the fake executor returns "9".
    out = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(sum(map(int, input().split())))",
        [{"id": "t1", "answer": "O(1)"}],
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        attempts=attempts,
        publisher=pub,
        limiter=_Limiter(),
        executor=_exec_returning("9\n"),
    )
    assert out["cases_passed"] == 1 and out["cases_total"] == 1
    assert out["typed_correct"] == 1 and out["typed_total"] == 1
    assert out["passed"] is True
    assert len(attempts.inserted) == 1
    assert ("coding.graded", {"application_id": "a1", "passed": True}) in pub.events


async def test_submit_fails_when_case_mismatches():
    out = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(0)",
        [],
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        attempts=_Attempts(),
        publisher=_Pub(),
        limiter=_Limiter(),
        executor=_exec_returning("0\n"),  # expected "9" → mismatch
    )
    assert out["cases_passed"] == 0 and out["passed"] is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_coding.py -q`
Expected: FAIL — `AttributeError: module 'app.resources.coding' has no attribute 'run_code_attempt'`.

- [ ] **Step 3: Implement** (append to `src/admin/app/resources/coding.py`)

```python
from lib.execution import ExecLimits

from app.errors import RateLimitedError, ValidationError
from app.model.coding import CodingAttempt

_MAX_SOURCE = 64 * 1024
_RUN_LIMIT = 30
_RUN_WINDOW = 60


async def _rate_limit(limiter, identity, application_id):
    hit = await limiter.hit(
        f"coding_run:{identity['id']}:{application_id}", _RUN_LIMIT, _RUN_WINDOW
    )
    if not hit.allowed:
        raise RateLimitedError("Too many runs, slow down")


def _validate(task, language, source):
    if language not in task.get("languages", ["python"]):
        raise ValidationError(f"language not allowed: {language}")
    if len(source) > _MAX_SOURCE:
        raise ValidationError("source too large")


def _limits(task):
    return ExecLimits(
        cpu_seconds=task.get("cpu_seconds", 2),
        wall_seconds=float(task.get("wall_seconds", 5)),
    )


async def run_code_attempt(
    identity,
    application_id,
    language,
    source,
    stdin,
    *,
    applications,
    tasks,
    limiter,
    executor=run_code,
):
    application = await _owned(identity, application_id, applications)
    task = await tasks.get_by_job(application["job_id"])
    if task is None:
        raise NotFoundError("Coding task not ready")
    _validate(task, language, source)
    await _rate_limit(limiter, identity, application_id)
    result = await executor(language, source, stdin, limits=_limits(task))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "time_ms": result.time_ms,
        "timed_out": result.timed_out,
    }


def _grade_typed(task, typed_answers):
    by_id = {a["id"]: a.get("answer", "") for a in typed_answers}
    questions = task.get("typed_questions", [])
    correct = sum(
        1
        for q in questions
        if any(_normalize(by_id.get(q["id"], "")) == _normalize(a) for a in q["accepted"])
    )
    return correct, len(questions)


async def submit_coding(
    identity,
    application_id,
    language,
    source,
    typed_answers,
    *,
    applications,
    tasks,
    attempts,
    publisher,
    limiter,
    executor=run_code,
):
    application = await _owned(identity, application_id, applications)
    task = await tasks.get_by_job(application["job_id"])
    if task is None:
        raise NotFoundError("Coding task not ready")
    _validate(task, language, source)
    await _rate_limit(limiter, identity, application_id)
    hidden = task.get("hidden_cases", [])
    limits = _limits(task)
    cases_passed = 0
    for case in hidden:
        result = await executor(language, source, case.get("stdin", ""), limits=limits)
        if _grade_case(result, case.get("expected_stdout", "")):
            cases_passed += 1
    typed_correct, typed_total = _grade_typed(task, typed_answers)
    cases_total = len(hidden)
    passed = cases_passed == cases_total and typed_correct == typed_total
    await attempts.insert(
        CodingAttempt(
            application_id=application_id,
            comp_id=application["comp_id"],
            candidate_user_id=identity["id"],
            job_id=application["job_id"],
            cases_passed=cases_passed,
            cases_total=cases_total,
            typed_correct=typed_correct,
            typed_total=typed_total,
            passed=passed,
        )
    )
    await publisher.publish(
        "coding.graded", {"application_id": application_id, "passed": passed}
    )
    log.info(
        "coding graded: app={} cases={}/{} typed={}/{} passed={}",
        application_id,
        cases_passed,
        cases_total,
        typed_correct,
        typed_total,
        passed,
    )
    return {
        "passed": passed,
        "cases_passed": cases_passed,
        "cases_total": cases_total,
        "typed_correct": typed_correct,
        "typed_total": typed_total,
    }
```

(Confirm `RateLimitedError` and `ValidationError` exist in `app/errors.py` — both are already defined and `_STATUS`-mapped. Add the imports only after the usages exist, per the hook constraint.)

- [ ] **Step 4: Run to verify pass**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_coding.py -q`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
.venv/bin/ruff check src/admin/app/resources/coding.py src/admin/tests/test_resources_coding.py
.venv/bin/ruff format --check src/admin/app/resources/coding.py
git add src/admin/app/resources/coding.py src/admin/tests/test_resources_coding.py
git commit -m "feat(coding): RunCode (ephemeral) + SubmitCoding grading + event (A6.4)"
```

---

## Task 5: Proto + servicer + web wiring + FE gen (admin)

**Files:**
- Create: `src/admin/app/routes/pb/coding.proto` (+ generated `coding_pb2.py/.pyi/_pb2_grpc.py`)
- Create: `src/admin/app/routes/coding.py`
- Modify: `src/admin/app/routes/web.py`, `src/admin/tests/test_web.py`
- Create: `src/admin/tests/test_coding_grpc.py`
- Modify: `frontend/packages/api-client/src/gen/coding_pb.ts` (generated)

**Interfaces:**
- Consumes: `resources/coding.{get_coding_task, run_code_attempt, submit_coding}`; `caller_identity`, `_STATUS`, `_abort` (mirror `routes/aptitude.py`).
- Produces: gRPC `admin.coding.v1.CodingService` with `GetCodingTask`/`RunCode`/`SubmitCoding`.

- [ ] **Step 1: Write the proto** (`src/admin/app/routes/pb/coding.proto`)

```proto
syntax = "proto3";

package admin.coding.v1;

// CodingService — candidate runs + submits assessment code. Execution is server-side
// (resource-capped subprocess). Candidate-owned via the application; hidden test cases
// and typed answer keys never cross the wire.
service CodingService {
  rpc GetCodingTask(GetCodingTaskRequest) returns (CodingTask);
  rpc RunCode(RunCodeRequest) returns (RunResult);          // ephemeral, no grade
  rpc SubmitCoding(SubmitCodingRequest) returns (SubmitResult);
}

message GetCodingTaskRequest { string application_id = 1; }

message TestCase {
  string stdin = 1;
  string expected_stdout = 2;
}

message TypedQuestion {
  string id = 1;
  string prompt = 2;     // accepted answers are server-side only
}

message CodingTask {
  string application_id = 1;
  string title = 2;
  string prompt = 3;
  repeated string languages = 4;
  string starter_code = 5;
  repeated TestCase sample_cases = 6;          // visible only
  repeated TypedQuestion typed_questions = 7;
  int32 cpu_seconds = 8;
  int32 wall_seconds = 9;
}

message RunCodeRequest {
  string application_id = 1;
  string language = 2;
  string source = 3;
  string stdin = 4;
}

message RunResult {
  string stdout = 1;
  string stderr = 2;
  int32 exit_code = 3;
  int32 time_ms = 4;
  bool timed_out = 5;
}

message TypedAnswer {
  string id = 1;
  string answer = 2;
}

message SubmitCodingRequest {
  string application_id = 1;
  string language = 2;
  string source = 3;
  repeated TypedAnswer typed_answers = 4;
}

message SubmitResult {
  bool passed = 1;
  int32 cases_passed = 2;
  int32 cases_total = 3;
  int32 typed_correct = 4;
  int32 typed_total = 5;
}
```

- [ ] **Step 2: Generate the Python stubs**

Run: `cd src/admin && ../../.venv/bin/python -m grpc_tools.protoc -I . --python_out=. --grpc_python_out=. --pyi_out=. app/routes/pb/coding.proto`
Expected: `coding_pb2.py`, `coding_pb2.pyi`, `coding_pb2_grpc.py` created.

- [ ] **Step 3: Write the servicer** (`src/admin/app/routes/coding.py` — mirror `routes/aptitude.py`)

```python
"""gRPC CodingService — thin adapter over resources/coding (candidate-owned)."""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import coding as coding_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import coding_pb2, coding_pb2_grpc

log = get_logger(component="coding.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total", "gRPC domain errors", ["method"]
)


class CodingServicer(coding_pb2_grpc.CodingServiceServicer):
    def __init__(self, *, applications, tasks, attempts, publisher, limiter, tokens):
        self._applications = applications
        self._tasks = tasks
        self._attempts = attempts
        self._publisher = publisher
        self._limiter = limiter
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetCodingTask(self, request, context):
        _grpc_total.labels(method="GetCodingTask").inc()
        async with log_context(
            log, "coding.GetTask", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                t = await coding_res.get_coding_task(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    tasks=self._tasks,
                )
                return coding_pb2.CodingTask(
                    application_id=t["application_id"],
                    title=t["title"],
                    prompt=t["prompt"],
                    languages=t["languages"],
                    starter_code=t["starter_code"],
                    sample_cases=[
                        coding_pb2.TestCase(
                            stdin=c["stdin"], expected_stdout=c["expected_stdout"]
                        )
                        for c in t["sample_cases"]
                    ],
                    typed_questions=[
                        coding_pb2.TypedQuestion(id=q["id"], prompt=q["prompt"])
                        for q in t["typed_questions"]
                    ],
                    cpu_seconds=t["cpu_seconds"],
                    wall_seconds=t["wall_seconds"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetCodingTask")

    async def RunCode(self, request, context):
        _grpc_total.labels(method="RunCode").inc()
        async with log_context(
            log, "coding.Run", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await coding_res.run_code_attempt(
                    identity,
                    request.application_id,
                    request.language,
                    request.source,
                    request.stdin,
                    applications=self._applications,
                    tasks=self._tasks,
                    limiter=self._limiter,
                )
                return coding_pb2.RunResult(
                    stdout=r["stdout"],
                    stderr=r["stderr"],
                    exit_code=r["exit_code"],
                    time_ms=r["time_ms"],
                    timed_out=r["timed_out"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "RunCode")

    async def SubmitCoding(self, request, context):
        _grpc_total.labels(method="SubmitCoding").inc()
        async with log_context(
            log, "coding.Submit", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await coding_res.submit_coding(
                    identity,
                    request.application_id,
                    request.language,
                    request.source,
                    [{"id": a.id, "answer": a.answer} for a in request.typed_answers],
                    applications=self._applications,
                    tasks=self._tasks,
                    attempts=self._attempts,
                    publisher=self._publisher,
                    limiter=self._limiter,
                )
                return coding_pb2.SubmitResult(
                    passed=r["passed"],
                    cases_passed=r["cases_passed"],
                    cases_total=r["cases_total"],
                    typed_correct=r["typed_correct"],
                    typed_total=r["typed_total"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "SubmitCoding")
```

- [ ] **Step 4: Register in `web.py`** (add the usage BEFORE the imports, per the hook). In `create_web_app`, after the AptitudeService block:

```python
coding_pb2_grpc.add_CodingServiceServicer_to_server(
    CodingServicer(
        applications=ApplicationRepository(db),
        tasks=CodingTaskRepository(db),
        attempts=CodingAttemptRepository(db),
        publisher=publisher,
        limiter=RateLimiter(redis),
        tokens=tokens,
    ),
    app,
)
```

Then add the imports: `from app.routes.coding import CodingServicer`, `coding_pb2_grpc` into the `app.routes.pb` import block, and the two repo imports.

- [ ] **Step 5: Bump the smoke test** (`src/admin/tests/test_web.py`) — increment the service-count assertion by 1 and add `assert "/admin.coding.v1.CodingService/SubmitCoding" in <handler set>` (match the file's existing assertion form).

- [ ] **Step 6: Write the over-the-wire test** (`src/admin/tests/test_coding_grpc.py`) — mirror `test_scheduling_grpc.py` framing (`GrpcWebASGI` + `_frame`/`_ds`/`_call`). Cover: no-auth → 16; non-owner → 7; happy-path `SubmitCoding` with an injected fake executor returning the expected stdout → `passed=True`. Inject the executor by constructing `CodingServicer` with fakes and (for the wire test) monkeypatch `coding_res.run_code` to a fake, OR assert via the resource tests (Task 4) and keep the wire test to auth + a single passing submit using a tiny real `python` program (POSIX-guarded).

```python
# Real-execution happy path (POSIX-guarded): a one-line program that echoes sums.
# Skipped on non-POSIX. Asserts the wire path returns passed=True for a correct sol'n.
```

- [ ] **Step 7: Generate the FE client + verify gate**

```bash
cd frontend && npx pnpm@9.15.0 --filter @ip/api-client gen
cd /Users/rugwedpatharkar/Projects/Project
.venv/bin/ruff check src/admin/app/routes/coding.py src/admin/app/routes/web.py src/admin/tests/test_coding_grpc.py src/admin/tests/test_web.py
cd src/admin && ../../.venv/bin/python -m pytest -q   # full admin suite green
```

- [ ] **Step 8: Commit**

```bash
git add src/admin/app/routes/pb/coding.proto src/admin/app/routes/pb/coding_pb2.py src/admin/app/routes/pb/coding_pb2.pyi src/admin/app/routes/pb/coding_pb2_grpc.py src/admin/app/routes/coding.py src/admin/app/routes/web.py src/admin/tests/test_coding_grpc.py src/admin/tests/test_web.py frontend/packages/api-client/src/gen/coding_pb.ts
git commit -m "feat(coding): admin.coding.v1 CodingService (Get/Run/Submit) + gen (A6.5)"
```

---

## Task 6: Eraser cascade for coding attempts (candidate data)

**Files:**
- Modify: `src/admin/app/resources/compliance.py` (`CandidateEraser`), `src/admin/app/routes/web.py` (`make_eraser`), `src/admin/tests/conftest.py` (fakes)
- Test: `src/admin/tests/test_resources_compliance.py` (or wherever eraser cascade is tested)

**Interfaces:**
- Consumes: `CodingAttemptRepository.delete_by_candidate`.
- Produces: erasing a candidate also deletes their `coding_attempts`.

- [ ] **Step 1: Write the failing test** — extend the existing eraser test: seed a coding attempt for the candidate, run the erase, assert it is gone and the deleted-count is reported. (Mirror the aptitude-attempts assertion already in that test.)

- [ ] **Step 2: Run to verify failure** — `cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_compliance.py -q` → FAIL (attempt not deleted).

- [ ] **Step 3: Implement** — add `coding_attempts` to `CandidateEraser.__init__`, call `delete_by_candidate` in the erase cascade (mirror `attempts`), wire `coding_attempts=CodingAttemptRepository(db)` in `make_eraser`, and add the fake to `conftest.py`.

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/app/resources/compliance.py src/admin/app/routes/web.py src/admin/tests/conftest.py src/admin/tests/test_resources_compliance.py
git commit -m "feat(coding): erase coding_attempts in CandidateEraser cascade (A6.6)"
```

---

## Task 7: Full gate + push

- [ ] **Step 1: Run the full gate**

Run: `cd /Users/rugwedpatharkar/Projects/Project && bash scripts/check.sh`
Expected: ruff format + lint + pip-audit + pytest (lib/admin/ai-agents/mcp) all GREEN. (lib gains `test_execution.py`; admin gains the coding suites.)

- [ ] **Step 2: Push**

Run: `git push origin HEAD:<current-branch>`

---

## Task 8: Coding-task authoring — static seed (decided)

> Only needed so `GetCodingTask` returns a real task in a running environment. A rich task editor is a separate effort; this ships the deterministic seed.

**Decided (2026-06-20): static seed now; LLM-authoring is a later, gated follow-up (option c below).** Rationale: test cases are correctness-critical — an LLM-written `expected_stdout` silently mis-grades every *correct* solution. Ship the executor + grading against human-verified cases first; the seed also gives the gRPC/FE path a real task to exercise end-to-end.

**Files:**
- Create: `src/admin/scripts/seed_coding_task.py` (a small idempotent script/migration).

- [ ] **Step 1: Write the seed** — idempotent upsert keyed by `job_id`: `coding_tasks.update_one({"job_id": jid}, {"$set": doc}, upsert=True)`, where `doc` is a `CodingTask` with a known problem, **human-verified** `sample_cases` + `hidden_cases`, and any `typed_questions`. Validate the shape through the model first: `CodingTask(**doc)`.

- [ ] **Step 2: Verify end-to-end** — run the seed against a dev DB, then `GetCodingTask` → confirm the DTO returns **sample cases only** (no hidden, no typed `accepted`); `SubmitCoding` with a correct solution → `passed=True`; with a wrong one → `passed=False`.

- [ ] **Step 3: Commit** — `git add src/admin/scripts/seed_coding_task.py && git commit -m "feat(coding): static coding-task seed (A6.8)"`.

### Follow-up (option c) — LLM authoring, gated on a reference solution

> NOT in this plan's critical path — capture as a follow-up issue.

When scaling authoring, extend the ai-agents Aptitude-Setter with a `build_coding_task` agent that emits a `coding_tasks` doc on job publish — **but gate every generated task on verification**: run a known-good reference solution through `lib.execution.run_code` against the task's own `hidden_cases` and **auto-reject the task if the reference solution does not pass all of them**. This reuses the Task 1 executor, so it is cheap only *after* A6 ships. Until that gate exists, LLM-generated tasks must never grade candidates.

---

## Task 9: Deploy-layer isolation — NetworkPolicy + seccomp + non-root (decided)

**Files:**
- Create: `deploy/coding-executor-networkpolicy.yaml`
- Create: `deploy/coding-executor-seccomp.json`
- Create: `docs/superpowers/plans/A6-EXECUTION-SECURITY.md`

- [ ] **Step 1: Write the NetworkPolicy** — deny-all-egress for the pod(s) that execute code (the executor needs no network). Adjust to the cluster's labels:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: coding-executor-deny-egress
spec:
  podSelector:
    matchLabels: { app: admin-service }   # or a dedicated executor Deployment
  policyTypes: [Egress]
  egress: []                              # deny all egress — candidate code has no network
```

- [ ] **Step 2: Write the seccomp profile** (`deploy/coding-executor-seccomp.json`) — deny the socket syscall family so candidate code cannot open any connection, **without privilege**. Targeted denylist over the runtime default (a full default-deny allowlist for a Python interpreter is large/fragile — note it as the stronger long-term option):

```json
{
  "defaultAction": "SCMP_ACT_ALLOW",
  "syscalls": [
    {
      "names": [
        "socket", "socketcall", "connect", "bind", "listen",
        "accept", "accept4", "sendto", "recvfrom", "sendmsg", "recvmsg"
      ],
      "action": "SCMP_ACT_ERRNO",
      "errnoRet": 1
    }
  ]
}
```

- [ ] **Step 3: Pin the Pod securityContext** — document the required executor pod spec: unprivileged, non-root, no caps, seccomp referencing the profile (loaded on nodes via `localhostProfile`):

```yaml
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities: { drop: ["ALL"] }
  seccompProfile:
    type: Localhost
    localhostProfile: coding-executor-seccomp.json
# + cgroup mem/PID caps via resources.limits — the authoritative limits over the
#   coarse rlimits the executor sets in code.
```

- [ ] **Step 4: Write the security doc** — `A6-EXECUTION-SECURITY.md` capturing: the **code-level** controls (Task 1: rlimits + scrubbed env + wall-timeout + process-group kill); the **hard deploy requirements** — (a) deny-egress NetworkPolicy **and** seccomp deny-socket, (b) `runAsNonRoot` + drop-ALL-caps + `allowPrivilegeEscalation: false`, (c) secrets via env only (never file mounts the child can read), (d) cgroup mem/PID limits as the authoritative caps; the **CNI assertion** — NetworkPolicy only bites on Calico/Cilium-class CNIs, so add a deploy/CI check that the policy is applied (off-k8s: host egress-firewall rules); and the **optional hardening** — run the executor in a dedicated Deployment of the same image (no new code), secret-free. Record the rejected alternative (privileged network namespaces) and why.

- [ ] **Step 5: Commit**

```bash
git add deploy/coding-executor-networkpolicy.yaml deploy/coding-executor-seccomp.json docs/superpowers/plans/A6-EXECUTION-SECURITY.md
git commit -m "docs(coding): deploy isolation — NetworkPolicy + seccomp + non-root (A6.9)"
```

---

## A6 frontend changes (separate FE session — Recipe R2)

Per `coding-assessment.md`: wire `coding` into `api-client` (the quad), then flip the coding-assessment screen off its mock:
- `GetCodingTask` → render prompt + starter + **sample** cases + typed questions.
- "Run" button → `RunCode(application_id, language, source, stdin)` → show stdout/stderr/exit/time.
- "Submit" → `SubmitCoding(...)` → show `cases_passed/cases_total` + `typed_correct/typed_total` + pass/fail. The hidden-case detail never appears (server-only).
- Keep the MCQ path (AptitudeService) unchanged; the coding path simply becomes real.

---

## Self-Review — spec coverage

- **"Run code internally, no hosted API / no sandbox VM"** → Task 1 (stdlib subprocess executor), Task 9 (deploy-layer isolation, same-image optional placement). ✅
- **`RunCode` ephemeral** → Task 4 `run_code_attempt` (no persistence). ✅
- **`SubmitCoding` runs hidden cases → pass counts** → Task 4 `submit_coding`. ✅
- **Typed sections grade like MCQ** → Task 4 `_grade_typed` (normalized match). ✅
- **Answer key never leaves server** → Task 3 `_public_task` strips `hidden_cases` + typed `accepted`; tested. ✅
- **Candidate-owned, tenant-scoped** → reuse `_owned`; cross-tenant → Forbidden/NotFound. ✅
- **Resource caps + scrubbed env + timeout** → Task 1 (tested: timeout, env scrub, output truncation). ✅
- **Persistence + eraser** → Tasks 2/4/6 (`coding_attempts` + cascade). ✅
- **Contract wired + codegen** → Task 5 (proto/servicer/web/`pnpm gen`). ✅
- **No new dependency** → executor is stdlib; verified by imports. ✅
- **Type consistency** → `ExecResult`/`ExecLimits` (Task 1) consumed unchanged in Tasks 3/4; DTO keys (`cases_passed`, `cases_total`, `typed_correct`, `typed_total`, `passed`) identical across resource → servicer → proto. ✅
- **Decisions resolved** → network isolation = deny-egress NetworkPolicy + seccomp deny-socket on an unprivileged/non-root executor (Task 9); authoring = static seed now, LLM-authoring deferred + reference-solution-gated (Task 8). Still out of scope: funnel gating on coding results. ✅

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-20-a6-internal-code-execution.md`. **Both open decisions are resolved:** network isolation = deploy-layer NetworkPolicy + seccomp deny-socket on an unprivileged executor (Task 9); authoring = static seed now, LLM-authoring deferred + reference-solution-gated (Task 8). Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which execution approach?
