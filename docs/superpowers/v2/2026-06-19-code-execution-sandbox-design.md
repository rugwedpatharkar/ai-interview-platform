# Code Execution Sandbox — Design

> **Context.** v2 Inc 2, Pillar B (see `2026-06-19-v2-architecture-overview-design.md` §5
> Pillar B). This is the **one genuinely new infrastructure piece** in v2: a `run_code` tool
> on **mcp-capability** that compiles + runs **untrusted candidate code** against test cases
> and returns per-case results. Its consumer is the Rich-Assessments `grade_coding` grader
> (`2026-06-19-rich-assessments-design.md`) — this spec owns the *runner*; that spec owns the
> *scoring*. **Local-only personal project; never run git/gh.** No production code yet — this
> documents the design so the later plan (`2026-06-19-code-execution-sandbox.md`) can build it
> behind a fake that keeps `bash scripts/check.sh` offline.

---

## 1. Goal & scope

**In scope.** A single new capability tool, `run_code(language, source, test_cases)`, that:
- runs candidate-submitted `source` once per test case in a **disposable, locked-down
  environment**,
- compares captured stdout against each case's `expected`,
- returns a typed `RunResult` (per-case pass/fail + timing/resource flags + truncated
  output), never a score and never a verdict — **scoring lives in the grader**.

It sits behind an injected **`CodeRunner` Protocol** in `app/seams/` (mirroring the existing
`embedder`/`vector_store`/`fetcher` seams), with a **`FakeCodeRunner`** for offline tests.
The real runner (`DockerCodeRunner`) is the **only** module that imports the Docker SDK.

**Languages (v2.0):** Python and JavaScript (one prebuilt image each). The runner dispatches
on `language` → image + run command; adding Java/Go/C++ later is one image + one table row,
no contract change.

**Out of scope (deferred / YAGNI).**
- Interactive/stdin-streaming programs, multi-file projects, package installation at submit
  time (images ship a frozen, offline stdlib only).
- Persistent judge queue / autoscaling worker pool — `run_code` runs synchronously inside the
  capability call; a queue is a later optimization, not a v2.0 need.
- Any third-party/paid code-judge SaaS (Judge0 cloud, HackerRank, Sphere) — must be
  **free/self-hostable** per the v2 posture.
- gVisor / Firecracker / Kata microVMs — documented as the stronger-isolation upgrade path
  (§4) but not required for the personal/demo phase; plain Docker with the §4 invariants is
  the v2.0 floor.

---

## 2. Where it fits

```
ai-agents grade_coding  ──MCP──►  mcp-capability.run_code  ──►  CodeRunner (seam)
  (assessments grader)            (tool wrapper, app/tools.py)        │
                                                                       ├─ FakeCodeRunner  (tests / offline gate)
                                                                       └─ DockerCodeRunner (live: one container per submission)
                                                                                 │
                                                                          Docker daemon
                                                                          ┌──────────────────────────────┐
                                                                          │ ephemeral per-run container  │
                                                                          │ --network=none, --read-only, │
                                                                          │ mem/cpu/pids capped, non-root│
                                                                          │ tmpfs scratch, wall-clock kill│
                                                                          └──────────────────────────────┘
```

- **mcp-capability** already exposes tools as FastMCP tools wrapping transport-agnostic
  functions in `app/tools.py`, with seams built lazily in `server.py::_ensure_rag()` and
  injected as kwargs. `run_code` follows that pattern exactly: a `run_code(...)` function in
  `app/tools.py` takes a `runner=` kwarg; `server.py` adds a `@mcp.tool()` wrapper and builds
  the `DockerCodeRunner` once (lazily, same double-checked-lock path as the RAG seams).
- **ai-agents** consumes it as an MCP client. `app/infra/mcp_capability.py::McpCapability`
  gains a `run_code(...)` method (one more `self._session.call_tool("run_code", {...})` +
  `unwrap`), exactly like the existing `parse_document`/`embed`/`kb_search`/`ingest` methods.
  The assessments `grade_coding` grader calls `capability.run_code(...)`.
- **No funnel/event coupling here.** The sandbox emits nothing and knows nothing about
  applications, `comp_id`, or `aptitude.graded`. It is a pure compute capability; the
  assessments engine is the only thing that turns its `RunResult` into a section score and the
  funnel-driving event. This keeps the security-critical surface tiny and single-purpose.

---

## 3. Design

### 3.1 Contract (the seam)

`CodeRunner` is a duck-typed Protocol in `app/seams/code_runner.py` (the project's seams are
duck-typed contracts with a real impl + a `Fake*`, not ABCs):

```python
class CodeRunner(Protocol):
    async def run(
        self, *, language: str, source: str, test_cases: list[TestCase]
    ) -> RunResult: ...
```

- `TestCase`: `{stdin: str, expected: str, hidden: bool, weight: float = 1.0}` — the runner
  reads `stdin`/`expected` (and echoes `hidden` back per case so the grader can weight hidden
  cases higher); it never interprets `weight` (the grader does).
- `RunResult`: `{compile_ok: bool, compile_error: str = "", cases: list[CaseResult]}`.
- `CaseResult`: `{hidden: bool, passed: bool, status: Literal["ok","wrong","timeout","oom","error"], stdout_truncated: str, duration_ms: int}`.

The runner returns **structured failure, never raises into the grader for candidate-caused
failures** (a timeout, OOM, runtime crash, or wrong output is data, not an exception). It
raises a typed `SandboxError` only for *infrastructure* failure (Docker daemon unreachable,
image missing, the runner itself broke) — the boundary the grader catches and surfaces as
"could not run", distinct from "candidate failed".

### 3.2 `run_code` tool function (`app/tools.py`)

Transport-agnostic, mirrors `parse_document`/`kb_search`:

```python
async def run_code(language, source, test_cases, *, runner, max_source_bytes=64_000):
    if language not in _SUPPORTED_LANGUAGES:        # boundary validation (untrusted input)
        raise ValueError(f"unsupported language: {language}")
    if len(source.encode()) > max_source_bytes:     # cap before it ever reaches a container
        raise ValueError("source too large")
    cases = [TestCase(**tc) for tc in test_cases]    # validate shape at the boundary
    return await runner.run(language=language, source=source, test_cases=cases)
```

Input validation lives here because this is a **system boundary receiving untrusted
candidate data** (per `~/.claude/CLAUDE.md`: validate at boundaries, trust internals). The
language allow-list, source-size cap, and case-count cap are enforced before anything is
handed to the container.

### 3.3 `DockerCodeRunner` (the only file that imports `docker`)

Per submission, **per test case**, the runner:
1. Writes `source` to a host temp dir (created with restrictive perms), mounted **read-only**
   into the container at a fixed path. Scratch/`/tmp` is a **tmpfs** so candidate writes never
   touch the host FS and vanish with the container.
2. Starts **one fresh container** from the language image with the §4 hardening flags, feeds
   the case's `stdin`, and enforces a **hard wall-clock kill** (asyncio timeout that
   `container.kill()`s + `remove()`s on expiry — independent of any in-container limit, which
   untrusted code could try to evade).
3. Reads back **at most N bytes** of stdout/stderr (output cap — a program printing forever
   can't exhaust host memory or the MCP response).
4. Classifies the case: clean exit + matching stdout → `ok`; clean exit + mismatch → `wrong`;
   killed by wall clock → `timeout`; OOM-killed → `oom`; non-zero exit / decode failure →
   `error`.
5. **`finally`: always** kill + remove the container and delete the temp dir — even on
   exception, cancellation, or daemon hiccup. A leaked container is the failure mode this
   design most aggressively forbids.

Compilation (JS none; future Java/Go) is a first compile step in its own short-lived
container; a compile failure short-circuits to `compile_ok=False` and skips the cases.

Containers are run **detached + reused-never**: one container handles exactly one case, then
is destroyed. This trades a little startup latency for the guarantee that **no state leaks
between test cases or between candidates** (a candidate can't poison a warm container for the
next case). Image pulls happen once at deploy; per-run cost is container create/start only.

### 3.4 Multi-tenancy

The sandbox is **stateless and tenant-agnostic by construction** — it holds no candidate data
across calls, writes nothing durable, and shares nothing between runs, so there is no
cross-tenant surface *inside* it. Tenancy (`comp_id` scoping, which submission belongs to
whom) is enforced entirely upstream in admin/assessments before `run_code` is ever called.
This is the strongest possible isolation story: the component that runs untrusted code simply
has no tenant data to leak.

---

## 4. Safety invariants (STOP-SHIP) & key decisions

Untrusted candidate code **must never touch the host, the network, other tenants' data, or
another submission's run.** The following are **STOP-SHIP invariants** — the build is not done
until every one is asserted in a test (against `FakeCodeRunner` for the contract, and called
out as a manual/integration check for the live runner) or enforced by a container flag:

| # | Invariant | Mechanism | Why it's STOP-SHIP |
|---|-----------|-----------|--------------------|
| S1 | **No network** | `--network=none` | Untrusted code must not exfiltrate, SSRF internal services, or phone home. |
| S2 | **No host filesystem** | image FS `--read-only` + **tmpfs** scratch; source mounted **read-only** | Code cannot read host secrets or write persistent/escape artifacts. |
| S3 | **Non-root** | image `USER` is an unprivileged uid; `--cap-drop=ALL`, `--security-opt=no-new-privileges` | Shrinks the kernel attack surface for container escape. |
| S4 | **Bounded memory** | `--memory=256m` (`--memory-swap` equal, no swap) | A fork bomb / allocation loop can't OOM the host; OOM → `oom` case, not a host crash. |
| S5 | **Bounded CPU** | `--cpus=0.5` | A busy loop can't starve the host or other runs. |
| S6 | **Bounded processes** | `--pids-limit=64` | Defuses fork bombs before they exhaust host PIDs. |
| S7 | **Hard wall-clock kill** | host-side asyncio timeout → `container.kill()` (NOT an in-container `ulimit`/`timeout`) | The timeout must be enforced by something the sandboxed code **cannot disable**; in-container limits are untrusted. |
| S8 | **Output cap** | read ≤ N bytes of stdout/stderr | Infinite-print can't exhaust host memory or the MCP message. |
| S9 | **Always reaped** | kill + `remove()` + temp-dir delete in `finally` | A leaked/lingering container is a resource leak *and* a persistence foothold. |
| S10 | **One container per run** | no container/process reuse across cases or candidates | No state, timing, or data leakage between submissions. |

**Decision — ephemeral per-submission Docker container (rationale).** The candidate-code
threat model is *adversarial by default*: assume the submission actively tries to escape, hang,
exhaust, or exfiltrate. Plain Docker with S1–S10 gives OS-level isolation (separate PID/mount/
network namespaces, cgroup limits) that is **free, self-hostable, already in the stack**
(`docker-compose`), and reproducible. It is the right floor for a personal/demo platform.

**Decision — in-process execution is REJECTED (STOP-SHIP).** Running candidate code in the
mcp-capability process (`exec`, `subprocess` without a container, RestrictedPython, a thread
with `signal`-based timeouts) is **explicitly forbidden**:
- It shares the host kernel, filesystem, network, env (secrets!), and the Python process
  itself with untrusted code — a single escape compromises the whole service and every
  tenant's data.
- "Sandboxing" the interpreter in-process (AST allow-lists, `__builtins__` stripping) is a
  well-known **losing arms race** (countless documented escapes); it cannot bound CPU/memory/
  fork reliably, and a `signal.alarm` timeout doesn't stop a C-extension busy loop.
- There is **no in-process configuration that satisfies S1–S10.** The only safe place to run
  adversarial code is a disposable OS-isolated container. This is non-negotiable.

**Decision — synchronous, no warm pool (v2.0).** Per-run container create/start adds latency,
but a warm pool reused across runs violates S10 (state leakage) unless each pooled container
is still single-use — at which point it's the same model. Keep it simple and safe first;
revisit pooling only if submit latency becomes a real problem.

**Upgrade path (documented, not built).** For a hostile multi-tenant production deployment,
swap `DockerCodeRunner` for a **gVisor (`runsc`) or Firecracker/Kata microVM** runner behind
the *same* `CodeRunner` Protocol — stronger kernel isolation, zero change to the tool, the
grader, or the contract. The seam is exactly what makes this a config/impl swap rather than a
rewrite.

---

## 5. Testing approach

- **Offline gate stays container-free.** `FakeCodeRunner` (scripted `RunResult`s) is the
  default in all unit tests; `bash scripts/check.sh` **never starts a container** (mirrors how
  `FakeEmbedder`/`FakeVectorStore`/`FakeFetcher` keep Qdrant/Gemini/httpx out of the gate).
  This is the same offline-gate discipline the voice plan uses for LiveKit/Groq.
- **Tool-function unit tests** (`test_run_code.py`, with `FakeCodeRunner`): unsupported
  language → `ValueError`; oversized source → `ValueError` (capped before the runner is
  touched); well-formed call forwards validated `TestCase`s and returns the runner's
  `RunResult`; a `SandboxError` from the runner propagates as the infra-failure boundary
  (distinct from candidate failure).
- **Seam fakes test** (`test_seams.py` style): `FakeCodeRunner` is deterministic and scripts
  per-case outcomes (ok/wrong/timeout/oom) so the grader's weighting logic is exercised
  without Docker.
- **Live runner = manual/integration only** (not in the gate): a known-good Python solution →
  all cases `ok`; an infinite loop → `timeout` (proves S7 host-side kill); a fork bomb →
  bounded by S6 then reaped; a network call → fails closed (proves S1); a host-FS write →
  fails / vanishes (proves S2); a never-ending print → truncated (S8); assert **no leaked
  containers** after a batch (`docker ps -a`) (proves S9/S10). These exercise the invariants
  the fake can't.

## 6. Open questions

- **Per-case vs per-submission container.** v2.0 = per-case (cleanest isolation, S10). If
  per-case startup latency is painful for large hidden-test suites, consider one container per
  *submission* that runs all cases sequentially in fresh subprocesses — weaker than per-case,
  stronger than reuse-across-candidates; decide with a real latency measurement.
- **Image build/versioning.** Pin language image tags (digests) and document the build in
  `docker/`; decide whether images are built locally or pulled. (Frozen offline stdlib only —
  no package install at submit time.)
- **Output cap & limits as config.** Memory (256m), CPU (0.5), pids (64), wall-clock, and
  output-byte cap should be `Settings` fields (per-language overrides?) rather than constants,
  so they're tunable without code change. Defaults above are the proposed starting point.
- **Timeout source of truth.** `time_limit_s` arrives per coding question from the assessment
  bank; confirm the runner's wall-clock kill uses that value (clamped to a hard max ceiling so
  a malformed bank can't request a 10-minute run).
