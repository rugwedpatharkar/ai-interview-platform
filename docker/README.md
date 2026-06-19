# Running the backend locally

The whole backend runs from one compose file: infra (MongoDB, Redis, RabbitMQ, MinIO) plus
the four services (`admin`, `ai-agents`, `mcp-data`, `mcp-capability`). This mirrors the
free-tier "single VM" shape in [`../docs/superpowers/plans/DEPLOYMENT.md`](../docs/superpowers/plans/DEPLOYMENT.md).

## Quick start

```bash
cp .env.example .env          # set JWT_SECRET (and GEMINI_API_KEY if you want real LLM)
docker compose up --build     # infra waits healthy, then services start
python scripts/smoke_login.py # RegisterCompany -> Login -> Me over gRPC-web (real socket)
```

Ports: `admin` gRPC-web **:8080** (browser-facing) · `ai-agents` interview API **:8081** ·
`mcp-data` **:8100** · `mcp-capability` **:8101** · RabbitMQ UI **:15672** · MinIO console **:9001**.

## Smoke test without Docker

The smoke script self-hosts admin under uvicorn with in-memory fakes — no infra needed —
proving the server boots and serves the full auth round-trip over a real socket:

```bash
python scripts/smoke_login.py --selftest
```

## Notes
- Images share one `docker/Dockerfile` (`--build-arg SERVICE=<name>`); it installs `lib`
  then the target service. `admin`/`ai-agents` run `app.main`; the MCP servers override the
  compose `command:` to `app.server`.
- Infra defaults (hostnames/creds) live in `docker-compose.yml`'s `x-common-env` and match
  `lib.config.BaseServiceSettings` defaults — services need no extra config to find each other.
- This is a **dev** stack (single replica, default creds). Production swaps in managed
  Mongo/Redis/RabbitMQ + R2 and a real `JWT_SECRET`/`GEMINI_API_KEY` — see DEPLOYMENT.md.
