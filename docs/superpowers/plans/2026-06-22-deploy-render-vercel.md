# Deploy runbook — Render (backend) + Vercel (frontend)

The definitive step-by-step, matched to the configs in the repo
(`backend/render.yaml`, `backend/Dockerfile`, `backend/config.example.yaml`,
`frontend/apps/candidate/vercel.json`). **$0/month, no credit card, full
functionality** (including the AI interview + Qdrant RAG). Demo / portfolio grade.

Everything below was validated: the consolidated container was built and run against
real infra — all 4 services + nginx stable, `/healthz`→ok, `/public/jobs`→live data,
`/agents/health`→200, ~387 MB RSS (fits Render free 512 MB).

---

## The stack (all 9 providers are free, no card at signup)

```
  Vercel (frontend)  ─→  Render (backend: 1 container, 4 services + nginx)
                              │
        ┌──────────┬─────────┼──────────┬───────────┬──────────┐
     Atlas M0   Upstash   CloudAMQP   Qdrant Cloud   R2      Gemini
     (Mongo)    (Redis)   (RabbitMQ)  (vectors)   (storage)  (LLM)
  UptimeRobot pings Render /healthz every 5 min so it never sleeps.
```

| Layer | Provider | Free | URL |
|---|---|---|---|
| Frontend | Vercel Hobby | ✅ | vercel.com |
| Backend compute | Render (Docker, free web service) | ✅ | render.com |
| MongoDB | Atlas M0 (512 MB) | ✅ | mongodb.com/cloud/atlas/register |
| Redis | Upstash (256 MB) | ✅ | upstash.com |
| RabbitMQ | CloudAMQP Little Lemur | ✅ | cloudamqp.com |
| Vector DB | Qdrant Cloud (1 GB) | ✅ | cloud.qdrant.io |
| Object storage | Cloudflare R2 (10 GB) | ✅ | dash.cloudflare.com |
| LLM | Google AI Studio (Gemini Flash) | ✅ | aistudio.google.com/apikey |
| Keep-alive | UptimeRobot | ✅ | uptimerobot.com |

> **Vercel Hobby is non-commercial.** If Aptura ever charges money, switch the
> frontend to Cloudflare Pages (also free, no card, commercial OK) — same env vars.

---

## Before you start — two honest notes

1. **`GEMINI_API_KEY` is mandatory.** ai-agents builds the Gemini client at startup and
   crash-loops without a key. Get one first (free, no card): https://aistudio.google.com/apikey
2. **Email is log-only right now.** The platform ships a `LoggingNotifier` — verification /
   reset links are written to the Render logs, not sent to inboxes. The candidate flow has
   **no email-verify gate**, so the app works fully without it. To send real email you'd wire
   an SMTP notifier (small follow-up); the `SMTP_*` keys are already plumbed in config.

---

## Part 1 — Make the accounts (~15 min, no card)

Sign up (use "Continue with GitHub" where offered): **Render, Vercel, MongoDB Atlas,
Upstash, CloudAMQP, Qdrant Cloud, Cloudflare, Google AI Studio, UptimeRobot.**

Keep a scratch `config.yaml` open (copy from `backend/config.example.yaml`) — you'll paste
~8 values into it as you go.

---

## Part 2 — Provision the data plane (~30 min)

### 2a. MongoDB (Atlas) → `mongo_uri`
1. Atlas → **Create** → **M0 (Free)** → AWS, region near your Render region → **Create**.
2. Create DB user: username `aptura`, **Autogenerate password** → copy it.
3. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`).
   (Render egress IPs rotate on free; the DB user/password still protect it.)
4. **Database → Connect → Drivers** → copy the URI; replace `<password>`:
   `mongodb+srv://aptura:PASS@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority`

### 2b. Redis (Upstash) → `redis_url`
1. **Create Database** → name `aptura`, **Regional**, region near Render → **Create**.
2. Copy the **`rediss://…` URL** (TLS — two s's).

### 2c. RabbitMQ (CloudAMQP) → `rabbitmq_url`
1. **Create New Instance** → `aptura`, plan **Little Lemur (Free)**, region near Render → create.
2. Open the instance → copy the **AMQP URL** (`amqps://…`).

### 2d. Vector DB (Qdrant Cloud) → `qdrant_url` + `qdrant_api_key`
1. **Create a free cluster** (1 GB, region near Render).
2. Copy the **cluster URL** (`https://xxxx.cloud.qdrant.io:6333`) and create/copy an **API key**.
   (Free cluster auto-suspends after 1 week idle — UptimeRobot traffic keeps the app warm; the
   cluster itself reactivates on the next query.)

### 2e. Storage (Cloudflare R2) → `s3_*`
1. Cloudflare → **R2 → Create bucket** → `interview-platform`.
2. **Manage R2 API Tokens → Create** (Object Read & Write on that bucket) → copy Access Key + Secret.
3. Endpoint = `https://<account-id>.r2.cloudflarestorage.com` (account ID on the R2 page).

### 2f. LLM (Gemini) → `gemini_api_key`
Google AI Studio → **Create API key** → copy.

### 2g. JWT secret → `jwt_secret`
```
openssl rand -hex 32
```

Your `config.yaml` (or env list) is now complete.

---

## Part 3 — Deploy the backend (Render Blueprint) (~15 min)

The repo has `backend/render.yaml`, so Render configures itself.

1. Render → **New → Blueprint** → connect your GitHub → pick `ai-interview-platform`.
2. Render reads `backend/render.yaml` and proposes the **aptura-backend** web service
   (Docker, free, health check `/healthz`). Apply.
3. Set the secret values. **Two ways — pick one:**

   **(A) Env vars (simplest, guaranteed).** In the service's **Environment** tab, use
   **Add from .env** / bulk-paste, in UPPERCASE:
   ```
   JWT_SECRET=...
   GEMINI_API_KEY=...
   MONGO_URI=...
   REDIS_URL=...
   RABBITMQ_URL=...
   QDRANT_URL=...
   QDRANT_API_KEY=...
   S3_ENDPOINT_URL=...
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   CORS_ALLOW_ORIGIN=https://PLACEHOLDER   # fix in Part 5
   ```
   (`S3_BUCKET`, `S3_REGION`, `SMTP_HOST/PORT/USER` already have defaults from render.yaml.)

   **(B) One config.yaml file (your single-file approach).** Environment → **Secret Files** →
   add a file named `config.yaml` with the contents of your filled-in YAML → then add one env
   var `CONFIG_FILE=/etc/secrets/config.yaml`. Nothing secret touches git.

4. **Create**. First build ~8–10 min (it compiles the consolidated image).
5. When live, Render shows `https://aptura-backend.onrender.com`. Test:
   `https://aptura-backend.onrender.com/healthz` → **ok**.

---

## Part 4 — Deploy the frontend (Vercel) (~10 min)

1. Vercel → **Add New → Project** → import the same repo.
2. **Root Directory** → **Edit** → `frontend/apps/candidate`. (vercel.json there handles the
   pnpm-monorepo install/build from the workspace root.)
3. **Environment Variables** (Production):
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_ADMIN_URL` | your Render URL, e.g. `https://aptura-backend.onrender.com` |
   | `NEXT_PUBLIC_AIAGENTS_URL` | same URL **+ `/agents`** (nginx routes it) |
   | `NEXT_PUBLIC_MOCK` | `0` |
   | `NEXT_PUBLIC_SITE_URL` | your Vercel URL (fill after first deploy) |
4. **Deploy** (~3 min). You get `https://<project>.vercel.app`.

---

## Part 5 — Connect the two (~5 min)

1. **Render** → service → Environment → set `CORS_ALLOW_ORIGIN` to your **exact** Vercel URL
   (`https://aptura.vercel.app`, with scheme, no trailing slash) → save (Render redeploys).
2. **Vercel** → set `NEXT_PUBLIC_SITE_URL` to the Vercel URL → redeploy.

---

## Part 6 — Keep the backend awake (UptimeRobot) (~5 min)

Render free sleeps after 15 min idle (30–60 s cold start). This prevents it.

1. UptimeRobot → **+ New monitor** → **HTTP(s)**.
2. URL: `https://aptura-backend.onrender.com/healthz`. Interval: **5 minutes**. Create.

---

## Part 7 — Smoke-test the whole funnel (~10 min)

On your Vercel URL, in order:
1. Landing renders, no console errors.
2. **Register a candidate** → dashboard greets you by name (confirms email-in-JWT).
3. **Jobs** → marketplace loads.
4. Second browser → **register a company** at `/company/register`.
5. **`/company/branding`** → editable form (not "Not found").
6. **Post a job** → publish.
7. Candidate → see the job → **apply**.
8. **Start the AI interview** on the application → ai-agents + Gemini + Qdrant exercised.
9. Company → see the applicant + the interview result.

First click after idle may take 30–60 s (cold start) — UptimeRobot keeps that rare.

---

## Part 8 — Backups (optional, ~10 min)

Atlas M0 has no automated backups. Daily dump → R2 (free, zero egress):
```bash
# anywhere with mongodb-database-tools + rclone (configured for R2):
mongodump --uri="$MONGO_URI" --archive --gzip | \
  rclone rcat r2:interview-platform/backups/mongo-$(date -u +%F).archive.gz
```
Run from a cron on any machine you control, or skip for a pure demo.

---

## Updating after a push

- **Backend:** Render auto-deploys on push to `main` (render.yaml `autoDeploy: true`).
- **Frontend:** Vercel auto-deploys on push.
Both rebuild from the repo — no manual step.

---

## Cost = $0/month. What's limited (be honest)

- **512 MB RAM** — fine for you + a few testers; sustained multi-user load may OOM-restart
  (bump to Render Starter $7/mo → 2 GB when you have real traffic).
- **Cold start** 30–60 s after idle (UptimeRobot minimizes).
- **Gemini Flash** 1,500 req/day; **Atlas M0** 512 MB / 500 conns; **Upstash** 500 k cmd/mo —
  the caps you'll hit first. All visible on their dashboards, all upgradeable piecewise.
- **Email** is log-only until an SMTP notifier is wired.
- **Vercel Hobby** non-commercial → swap to Cloudflare Pages the day you charge money.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Backend deploy crash-loops, "address already in use" | internal port clash with `$PORT` | Render uses `$PORT`=10000; don't override it to 8080 |
| ai-agents restarts forever | missing `GEMINI_API_KEY` | set it; it's mandatory at boot |
| Every API call CORS-fails | `CORS_ALLOW_ORIGIN` ≠ exact Vercel origin | match scheme + host exactly, redeploy backend |
| `/company/branding` "Not found" | running pre-`43f6210` FE | redeploy frontend |
| Dashboard shows a raw ObjectId | running pre-`1f0f902` backend | redeploy backend |
| Vercel build fails on `next` | wrong Node | set `NODE_VERSION=20` in Vercel env |
| Interview/RAG returns nothing | Qdrant suspended (1-wk idle) or wrong key | next query reactivates it; verify `QDRANT_URL`/`QDRANT_API_KEY` |
| Backend won't start, RabbitMQ error | CloudAMQP URL wrong | admin needs RabbitMQ at boot; verify `RABBITMQ_URL` |

---

## File reference

- `backend/render.yaml` — Render Blueprint (this drives Part 3)
- `backend/Dockerfile` + `backend/deploy/render/*` — the consolidated container
- `backend/config.example.yaml` — copy → `config.yaml`, the one-file secrets
- `frontend/apps/candidate/vercel.json` — Vercel monorepo build
- `frontend/apps/candidate/.env.example` — the 4 `NEXT_PUBLIC_*` vars
