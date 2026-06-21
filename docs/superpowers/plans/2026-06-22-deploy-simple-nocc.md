# Simple deploy — no credit card, no always-on machine

The whole thing runs in the cloud, for $0, with **no credit card anywhere** and
**nothing running on your computer**. Demo/portfolio grade.

## What you end up with

```
  Vercel (frontend)  →  Render (backend, 1 service)  →  Atlas (Mongo)
                                                     →  Upstash (Redis)
                                                     →  CloudAMQP (RabbitMQ)
                                                     →  Gemini (AI)
                                                     →  Resend (email)
  UptimeRobot pings Render every 5 min so it never sleeps.
```

All 8 providers are free and take **email/GitHub signup — no card.**

---

## Part 0 — what I (Claude) prepare first

You can't deploy the repo as-is on a free tier (it's 4 services; the free tier
fits ~1). Before you start, I do these code changes once:

1. **Merge the 4 backend services into 1 container** (so it fits Render's free 512 MB / 1-service budget).
2. **Add real email sending** (so verification emails work via Resend).
3. **Add a `/healthz` check** (so UptimeRobot can ping it).
4. **Turn off the vector-DB feature** (Qdrant doesn't fit 512 MB; the AI résumé-matching is disabled, everything else works).
5. **Add a `render.yaml`** (so Render auto-configures itself).

When these are done and pushed, you do Parts 1–7 below. **You write zero code.**

---

## Part 1 — Make the free accounts (15 min, no card)

Sign up for each (use "Sign in with GitHub" where offered):

1. **MongoDB Atlas** → https://www.mongodb.com/cloud/atlas/register
2. **Upstash** → https://upstash.com
3. **CloudAMQP** → https://www.cloudamqp.com
4. **Google AI Studio** → https://aistudio.google.com/apikey
5. **Resend** → https://resend.com
6. **Render** → https://render.com
7. **Vercel** → https://vercel.com
8. **UptimeRobot** → https://uptimerobot.com

None ask for a card. Keep a notes file open — you'll paste 6 secrets into it.

---

## Part 2 — Set up the databases (20 min)

### 2a. MongoDB (Atlas)

1. Atlas → **Create** → pick **M0 (Free)** → cloud **AWS**, region near you → **Create**.
2. It asks to create a user → username `aptura`, click **Autogenerate password** → **copy the password**.
3. Left menu → **Network Access** → **Add IP Address** → click **Allow access from anywhere** (`0.0.0.0/0`) → Confirm.
   *(Render's IP changes, so "anywhere" is the simple choice. The DB user/password still protect it.)*
4. Left menu → **Database** → **Connect** → **Drivers** → copy the connection string. Looks like:
   `mongodb+srv://aptura:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority`
5. Replace `<password>` with the password from step 2. **Save it** as `MONGO_URI`.

### 2b. Redis (Upstash)

1. Upstash → **Create Database** → name `aptura`, type **Regional**, region near you → **Create**.
2. Scroll to **Connect to your database** → copy the **`rediss://...` URL** (the one starting with `rediss`, two s's).
3. **Save it** as `REDIS_URL`.

### 2c. RabbitMQ (CloudAMQP)

1. CloudAMQP → **Create New Instance** → name `aptura`, plan **Little Lemur (Free)** → region near you → **Create instance**.
2. Click the instance → copy the **AMQP URL** (starts with `amqps://`).
3. **Save it** as `RABBITMQ_URL`.

### 2d. Gemini key

1. Google AI Studio → **Create API key** → copy it. **Save it** as `GEMINI_API_KEY`.

### 2e. Resend key

1. Resend → **API Keys** → **Create API Key** → copy it. **Save it** as `RESEND_API_KEY`.

You now have 5 secrets saved. Plus one you make yourself:

### 2f. JWT secret

Run this anywhere (or use any random 40+ character string):
```
openssl rand -hex 32
```
**Save the output** as `JWT_SECRET`.

---

## Part 3 — Deploy the backend (Render) (15 min)

1. Render dashboard → **New** → **Web Service**.
2. **Connect** your GitHub → pick the `ai-interview-platform` repo.
3. Render detects the `render.yaml` → it auto-fills the build settings. Click through.
4. Choose the **Free** instance type.
5. **Environment Variables** → add these (paste the values you saved):

   | Key | Value |
   |---|---|
   | `JWT_SECRET` | *(from 2f)* |
   | `MONGO_URI` | *(from 2a)* |
   | `REDIS_URL` | *(from 2b)* |
   | `RABBITMQ_URL` | *(from 2c)* |
   | `GEMINI_API_KEY` | *(from 2d)* |
   | `SMTP_PASS` | *(the `RESEND_API_KEY` from 2e)* |
   | `CORS_ALLOW_ORIGIN` | `https://aptura.vercel.app` *(update after Part 4)* |

6. Click **Create Web Service**. First build takes ~10 min.
7. When it's live, Render shows a URL like `https://aptura-api.onrender.com`. **Copy it** — that's your backend URL.
8. Test it: open `https://aptura-api.onrender.com/healthz` in a browser → should say `ok`.

---

## Part 4 — Deploy the frontend (Vercel) (10 min)

1. Vercel → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory** → click **Edit** → set to `frontend/apps/candidate`.
3. **Build settings** → Vercel detects Next.js. Leave defaults.
4. **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_ADMIN_URL` | *(your Render URL from Part 3.7)* |
   | `NEXT_PUBLIC_AIAGENTS_URL` | *(same Render URL)* |
   | `NEXT_PUBLIC_MOCK` | `0` |

5. Click **Deploy**. ~3 min. You get a URL like `https://aptura.vercel.app`.
6. **Go back to Render** → your service → **Environment** → set `CORS_ALLOW_ORIGIN` to your exact Vercel URL (`https://aptura.vercel.app`) → save. Render restarts itself.

---

## Part 5 — Keep the backend awake (UptimeRobot) (5 min)

Render's free backend sleeps after 15 min idle. This keeps it awake.

1. UptimeRobot → **+ New monitor**.
2. **Monitor Type:** HTTP(s).
3. **Friendly Name:** `aptura-keepalive`.
4. **URL:** `https://aptura-api.onrender.com/healthz` *(your Render URL + `/healthz`)*.
5. **Monitoring Interval:** 5 minutes.
6. **Create Monitor.**

Done — it now pings every 5 min, so the backend stays awake.

---

## Part 6 — Email setup (Resend) (10 min, optional but recommended)

Without this, verification emails only appear in Render's logs. To send real emails:

1. Resend → **Domains** → **Add Domain** → enter a domain you own.
   - **No domain?** Skip this — Resend lets you send from `onboarding@resend.dev` to *your own* signup email for testing. Good enough for a demo.
2. If you added a domain, Resend shows DNS records → add them at your domain registrar → wait for "Verified".
3. The `SMTP_PASS` you already set in Part 3 handles auth. If you verified a domain, also set on Render:
   - `SMTP_FROM` = `noreply@yourdomain.com`

---

## Part 7 — Test it (5 min)

Open your Vercel URL and walk through:

1. Landing page loads. ✅
2. **Register** a candidate → lands on the dashboard, greets you by name. ✅
3. **Browse jobs** → marketplace loads. ✅
4. Open a second browser → **register a company** at `/company/register`.
5. **Post a job** → publish.
6. Back as the candidate → see the job → **apply**.
7. Back as the company → see the applicant.

If the first click after a quiet period takes 30–60 sec, that's the backend
waking up — normal on the free tier. UptimeRobot keeps that rare.

---

## What this costs

| | |
|---|---|
| Money | **$0/month** |
| Credit card | **None, anywhere** |
| Your computer | **Off — everything's in the cloud** |

## What's limited (it's a demo, be honest about it)

- **First request after idle is slow** (30–60s cold start). UptimeRobot minimizes it.
- **512 MB RAM** — fine for you + a few testers, will struggle with a real crowd.
- **AI résumé-matching is off** (the vector DB doesn't fit free). Core hiring funnel works.
- **No AI voice interview** (needs more resources). Text flow works.
- **Atlas free = no backups** — if you keep real data, export it occasionally.
- **Vercel Hobby is non-commercial.** If Aptura ever charges money, switch the
  frontend to Cloudflare Pages (also free, no card, commercial OK) — same steps.

When you outgrow this, the upgrade path is in
[deploy-shape-a-self-hosted.md](./2026-06-21-deploy-shape-a-self-hosted.md)
(one Oracle VM, needs a card) — nothing here locks you in.

---

## Quick reference — the 7 secrets

| Name | From | Goes into |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | Render |
| `MONGO_URI` | Atlas | Render |
| `REDIS_URL` | Upstash | Render |
| `RABBITMQ_URL` | CloudAMQP | Render |
| `GEMINI_API_KEY` | Google AI Studio | Render |
| `SMTP_PASS` | Resend | Render |
| `NEXT_PUBLIC_ADMIN_URL` | Render URL | Vercel |
