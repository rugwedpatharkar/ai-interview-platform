# PRODUCTION STANDARDS

> The quality + security bar **every piece of code** on this platform must meet —
> robust, optimized, and secure as a professional product, not a prototype. This is
> the single source for the gate and the per-change checklist. See `ARCHITECTURE.md`
> for the system and `HANDOFF.md` for current state.

## 1. Core principle — rigor at boundaries, clean internals

"Extreme robustness" and "minimal, low-complexity code" are the **same** philosophy at
full strength: concentrate all defensive rigor and security checks at the **boundaries**
— external I/O, untrusted input, auth/tenant surfaces — and keep **internals minimal and
trusting**. The boundary *is* the contract surface; an internal helper called by typed
code is not. We do **not** scatter `try/except` or `isinstance` guards through pure
internal functions in the name of "robustness" — that is bloat, and it is banned.

## 2. Definition of Done (every change)

- [ ] **Boundary validation** — Pydantic models on every API / event / MCP edge; trust validated internals.
- [ ] **Every external call** (Mongo / Redis / RabbitMQ / LLM / S3 / MCP) has a **timeout** and **bounded retry/backoff**.
- [ ] **Event consumers are idempotent** (events redeliver); poison messages dead-letter, never loop (corelib `Consumer`).
- [ ] **Tenant-scoped** — every tenant doc + query carries `comp_id`, derived from the **authenticated token, never client input**.
- [ ] **Structured logging** with `comp_id`/`user_id`; **audit log** on every automated decision, override, and data access.
- [ ] **No secret, PII, or internal error detail** leaks into responses or logs.
- [ ] **TDD** — a failing test was written and watched fail before the code; unit (mock repo boundary) + integration (real infra) as applicable.
- [ ] **Gate green** — `bash scripts/check.sh` passes (format, lint+security, CVE audit, tests).

## 3. Robustness at I/O edges

| Concern | Rule |
|---|---|
| Timeouts | Every network/SDK call sets an explicit timeout; no unbounded waits. |
| Retries | Transient failures retried with bounded count + backoff; never infinite. |
| Idempotency | Consumers + mutating handlers are safe to run twice (events redeliver). |
| Poison messages | Dead-letter after `max_retries` (corelib `Consumer` → `{exchange}.dlx`), never requeue forever. |
| Backpressure | Prefetch/QoS bounds in-flight work; pools sized via config, not hardcoded. |
| Soft-fail | Only best-effort ops (telemetry, notifications) may swallow errors — and must log. Correctness paths hard-fail. |

## 4. Security baseline (professional, legally high-risk hiring product)

- **Tenant isolation** — `comp_id` from the authenticated JWT, never from client input; every tenant query scoped; **re-enforced again at `mcp-data`** (defense-in-depth — agents/chat must not be promptable into cross-tenant reads).
- **AuthN / AuthZ** — JWT with pinned algorithm + expiry; bcrypt + SHA-256 pre-hash; role guards **deny-by-default**; never return password hashes or internal errors.
- **Injection** — never pass raw client dicts as Mongo queries; validate at the boundary; prompt-injection handled in **code** at `mcp-data`, not by trusting the model.
- **Secrets** — env / secret-manager only; never in code, logs, or VCS.
- **PII / GDPR (LL144 / EU AI Act)** — consent gate before screening; audit trail on every decision/access; retention + deletion; resumes & recordings **encrypted at rest + served via signed, time-limited URLs** (no public buckets).
- **Supply chain** — pinned deps; `pip-audit` in the gate; no known-vuln packages.

## 5. Testing standard

- **TDD is mandatory** (HANDOFF §0): failing test first, watched fail, then minimal code.
- **Unit tests mock the repository boundary** (no DB) — see corelib `FakeCollection`/`FakeRedis`/`FakeMessage` stand-ins.
- **Integration tests** hit local infra (Mongo / Redis / RabbitMQ via docker-compose) for the I/O-touching modules (Mongo client, RabbitMQ DLX path, storage).
- Tests assert behavior, not mock internals; pristine output (no warnings).

## 6. The gate — `bash scripts/check.sh`

Runs, in order, and all must pass:
1. `ruff format --check` — formatting.
2. `ruff check` — lint, incl. **`S` (flake8-bandit) security rules** (the bandit-equivalent, so no second tool) and **`ASYNC`** (no blocking calls in async).
3. `pip-audit` — dependency CVEs.
4. `pytest` — corelib suite (admin-service joins below).

Config is `ruff.toml` (repo root). **In-flux admin-service files** (`app/api`, `app/main.py`, `tests`) are excluded **only** until the auth migration (HANDOFF §9.1) lands green — re-including them is part of that migration's Definition of Done. New modules are under the gate from their first line.

## 7. Pre-merge checklist (quick scan)

- [ ] `bash scripts/check.sh` green.
- [ ] Boundaries validated; internals minimal (no defensive bloat).
- [ ] Timeouts + bounded retries on all external calls; consumer idempotent.
- [ ] `comp_id` scoping derived from token; audit-logged where it's a decision/access.
- [ ] No secrets/PII/internal errors in responses or logs.
- [ ] Tests written test-first; unit + integration as applicable.
