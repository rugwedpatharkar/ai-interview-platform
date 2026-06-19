# DEPLOYMENT — free-tier path + browser↔backend transport

> How to run this platform (4 backend services + 2 frontend apps + infra) on **free
> resources** for a dev/demo/portfolio instance, and the **gRPC-web transport** decision
> that shapes how the browser reaches `admin`. Free tiers shift over time — treat the
> named tiers as a 2026 snapshot, not a contract.

## TL;DR
- **A $0 dev/demo deployment is realistic.** Not the target *scale* (1000s of companies,
  100k candidates) — free tiers throttle long before that — but the full funnel can run
  live for free.
- **One constraint shapes everything: the backend has always-on processes**, not just
  request/response. So "free" = a small **always-free VM**, not scale-to-zero serverless.
- **The browser cannot speak native gRPC.** `admin` is `grpc.aio` today; the browser needs
  a **gRPC-web** layer. Because `admin`'s gRPC is consumed **only by the browser** (services
  talk over RabbitMQ; ai-agents over MCP/SSE), the cleanest answer is to make `admin` speak
  gRPC-web **in-process** (no proxy) — see [Transport](#grpc-web-transport-the-decision).

---

## The shaping constraint: always-on, not serverless

| Service | Why it can't scale-to-zero |
|---|---|
| `ai-agents` | Runs a **RabbitMQ consumer** loop — sleeping drops the subscription, funnel stalls |
| `ai-agents` interview API | Holds **live interview sessions** (Redis-backed, but the HTTP process must stay up) |
| `mcp-data` / `mcp-capability` | Serve **long-lived SSE** to the ai-agents MCP client |
| `admin` | gRPC server; a consumer for funnel events also runs here |

Consequence: the *easy* free hosts don't fit the always-on parts —
- **Render free web services** sleep after ~15 min idle; **no free background-worker tier**.
- **Cloud Run / Vercel functions** scale to zero (request-driven) — fine for `admin`'s
  unary RPCs, wrong for the consumer/SSE.

→ The free deploy hinges on **one always-free VM** to host the always-on processes.

## Free-tier mapping (2026 snapshot)

| Component | Free option | Caveat |
|---|---|---|
| **Frontend** (Next.js × 2) | Cloudflare Pages / Vercel Hobby | Trivially free; Vercel Hobby is non-commercial |
| **Always-on compute** (admin, ai-agents, mcp-data, mcp-capability) | **Oracle Cloud Always Free** — ARM Ampere A1, up to 4 vCPU / 24 GB RAM | Keystone. Big enough to run all 4 + infra via docker-compose. CC required; may reclaim idle instances |
| **MongoDB** | Atlas **M0** (512 MB) *or* self-host on the VM | M0 forever-free but tiny & shared |
| **Redis** (interview state, rate-limit) | Upstash free *or* self-host | Upstash speaks standard Redis protocol over TLS → `redis.asyncio` works |
| **RabbitMQ** | CloudAMQP **Little Lemur** *or* self-host | Free plan ~1M msgs/mo, ~20 connections, 100 queues |
| **Object storage** (resumes, xlsx) | **Cloudflare R2** — 10 GB, zero egress | S3-compatible → drops into lib `ObjectStorage` with 4 env vars |
| **LLM** (Gemini Flash) | Google AI Studio free tier | Rate-limited (RPM/RPD) — demo-grade, not volume |

## Two deployment shapes

**A — Single always-free VM (simplest $0; recommended for a demo).**
One Oracle Ampere VM running `docker-compose`: all 4 Python services **plus** self-hosted
Mongo + Redis + RabbitMQ (24 GB RAM is plenty). Frontend on Cloudflare Pages, storage on R2,
LLM on Gemini. The always-on consumer/SSE problem disappears — it's just processes on a box.
No external message/storage caps to babysit; you manage one VM.

**B — Managed-free mix.** The 4 services on the VM; Mongo/Redis/RabbitMQ on
Atlas/Upstash/CloudAMQP. Less ops, but several dashboards and their caps to track. The
*stateless* services (`admin`, once it's HTTP — see Transport) could move to Cloud Run free,
but keep the RabbitMQ consumer + SSE servers on the VM.

## Why the codebase is already deploy-friendly
- **12-factor config:** Pydantic `BaseServiceSettings`, env-driven — no hardcoded hosts.
- **Storage abstraction:** `lib.storage.ObjectStorage` is S3-compatible → MinIO (local) and
  R2 (prod) differ only by env.
- **Stateless services + external state:** session/funnel state lives in Redis/Mongo, so
  services are restart-safe and horizontally scalable later.
- **Containerizable:** each service is a standalone `app/` with its own `pyproject.toml`.

## Honest limits / when you pay
- M0's 512 MB, Gemini's daily caps, CloudAMQP's message cap, and one small VM are the real
  ceilings. The **architecture** (event-driven microservices, tenant-scoped) scales fine —
  you swap free tiers for paid ones; nothing here paints you into a corner.
- Production would add: managed Mongo (Atlas paid / self-run replica set), managed Redis +
  RabbitMQ (or a cloud broker), autoscaled compute (GKE/Cloud Run min-instances), a real
  SMTP provider, and a paid Gemini quota.

---

## gRPC-web transport — the decision

**Problem.** Browsers can't emit raw gRPC: HTTP/2 frame control isn't exposed to `fetch`, and
the trailers gRPC needs aren't reachable. So a **gRPC-web** layer must translate between the
browser and a real gRPC server. `admin` is plain `grpc.aio` today.

**Key fact about our topology:** `admin`'s gRPC is consumed **only by the browser**.
Service-to-service is RabbitMQ events; ai-agents reaches data via MCP/SSE. So we are **not**
forced to keep a native-gRPC endpoint for any internal caller — a proxy would exist *purely*
to bridge to the browser, which is exactly the overhead the in-process options remove.

**Compatibility check (good news):** gRPC-web supports **unary + server-streaming** only (no
client-streaming/bidi). Every `admin` RPC is **unary** (auth, jobs, applications, decisions,
reports, profile, aptitude, compliance), and the live interview is plain HTTP on `ai-agents`
(not gRPC streaming). → fully gRPC-web compatible, no RPC has to change.

### Option 1 — Envoy proxy (canonical, zero server change)
`browser → gRPC-web → Envoy (grpc_web filter) → gRPC → admin`.
- **+** No change to `admin` (stays pure gRPC). Battle-tested; the reference setup.
- **−** An **extra always-on process** + `envoy.yaml` (incl. CORS). More memory.
- **Deploy:** another container in docker-compose on the VM. Ties you toward shape **A**
  (Envoy must be always-on somewhere). Awkward on serverless.

### Option 2 — In-process gRPC-web on `admin` (recommended) ✅ IMPLEMENTED
In-process gRPC-web translation wraps the existing **grpcio-generated servicers** and serves
gRPC-web directly; `admin` runs as an ASGI app (uvicorn), not a `grpc.aio.server()`.
- **+** **No proxy**, single process, fewest moving parts. Keeps current proto/codegen.
  `admin` becomes ordinary request/response HTTP → deploys **anywhere**, incl. scale-to-zero
  hosts (Cloud Run/Render free) since it's no longer a long-lived gRPC socket.
- **+** Pairs with the best browser client: **`@connectrpc/connect-web`** can talk the
  gRPC-web *protocol* against this server → typed connect-es clients, no Envoy.
- **−** Server moves to ASGI (fine at this scale). Needs CORS (handled in the translator).
- **Deploy:** one ASGI container. Most deployment-flexible option. **Best fit for the free
  plan** — works in both shapes A and B.
- **Built in-house, NOT via `sonora`.** The obvious library (`sonora` 0.2.3, the only release)
  **hard-pins `urllib3>=1.26.4,<2.0.0`**, dragging in urllib3 1.26.20 with **5 known CVEs** —
  `pip-audit` (the gate) fails. So `admin/app/routes/grpcweb.py` is a ~150-line unary gRPC-web
  → grpc translator with **zero new runtime deps** (stdlib + grpcio's own (de)serializers): it
  mimics the `grpc.Server` registration surface (`add_generic_rpc_handlers` +
  `add_registered_method_handlers`), so the *same* `add_<Svc>Servicer_to_server(servicer, app)`
  line that wired a grpc server now wires the ASGI app — servicers/protos unchanged.

### Option 3 — Connect end-to-end via **connecpy** + **connect-es**
Serve the **Connect protocol** (fetch-native HTTP/1.1 + JSON or binary; also speaks gRPC-web)
from `admin` using `connecpy` (community Python Connect), browser uses `@connectrpc/connect-web`.
- **+** Best long-term browser DX; Connect requests are plain HTTP POST (curl-able,
  CDN/proxy-friendly, easy to debug). One endpoint serves Connect + gRPC-web.
- **−** New server codegen (`connecpy` protoc plugin) replacing grpc_tools output;
  `connecpy` is **community-maintained** (less mature than grpcio). Larger upfront change.
- **Deploy:** ASGI container, same profile as Option 2.

### Recommendation
**Option 2 — proxy-free gRPC-web on `admin` + `@connectrpc/connect-web` on the frontend.**
It deletes the proxy (our topology never needed native gRPC for anyone but the browser),
keeps the existing protobuf/codegen, turns `admin` into a plain HTTP service that deploys on
*any* host, and still gives the nice connect-es typed client. Keep **Option 3 (Connect)** as a
drop-in upgrade if we later want fetch-native debugging — the browser client barely changes.
**Option 1 (Envoy)** is the fallback only if we must keep `admin` byte-for-byte pure gRPC.

**Cross-cutting (all options):** browser↔backend is cross-origin → needs **CORS** (handled in
the translator: preflight + `access-control-*` incl. `expose-headers: grpc-status,grpc-message`).
Auth stays JWT bearer in metadata/headers; gRPC-web maps cleanly to that. Client IP for
rate-limiting comes from `X-Forwarded-For` (the proxy/edge sets it; `peer()` would be the edge).

### Work to wire Option 2 — backend ✅ DONE
1. ✅ `uvicorn` added to `src/admin/pyproject.toml` (grpcio kept for status/serializers).
2. ✅ `app/routes/grpcweb.py` (`GrpcWebASGI` translator) + `app/routes/web.py` (`create_web_app`
   registering all 8 servicers) + `main.py` serves it via uvicorn alongside the funnel consumer.
3. ✅ Native `grpc.aio` server dropped (no non-browser gRPC caller); re-addable trivially since
   the registrar mimics `grpc.Server`. Config: `http_host`/`http_port` (8080) + `cors_allow_origin`.
4. ⏳ Frontend `packages/api-client`: generate TS from the `.proto`s (`buf` +
   `@bufbuild/protoc-gen-es`); use `@connectrpc/connect-web` with `createGrpcWebTransport`.
5. ⏳ Smoke-test one unary RPC (e.g. `Login`) browser→admin before building screens.

## Phasing the transport (decided + backend implemented)
**P1 → Option 2, in-process gRPC-web on `admin` (built in-house — sonora was CVE-blocked).**
Envoy (Option 1) is deferred to the **scale phase (P5)**, when there are multiple `admin`
replicas / a service mesh / edge observability to justify it. Rationale: Envoy's robustness is
*scale* robustness (LB, circuit breaking, mTLS) that P1 never exercises; the in-house translator
is correct and reliable for unary request/response at this stage. The choice is **reversible and
frontend-invisible** — the connect-es client speaks the gRPC-web protocol to our server or Envoy
identically, so dropping Envoy in front of the same servicers later is a backend-only change (no
RPC/proto/client edits). Bonus: gRPC-web over plain HTTP/1.1 passes cleanly through a free
Cloudflare proxy, whereas native gRPC behind Envoy is awkward through Cloudflare free.

## Open decisions
- **Transport:** **decided + backend DONE** → Option 2, in-house gRPC-web (`admin` serves over
  uvicorn :8080). Frontend client wiring pending; revisit Envoy at P5.
- **Free shape:** A (single VM) vs B (managed mix) — recommend **A** for a free demo.
- **First persona app** after the shared foundation: candidate vs company — *pending pick*.

## Service port map (defaults; override per env)
`admin` 8080 (gRPC-web, browser-facing) · `ai-agents` 8080 (interview API — override in local
dev to avoid colliding with admin) · `mcp-data` 8100 (SSE) · `mcp-capability` 8101 (SSE).
