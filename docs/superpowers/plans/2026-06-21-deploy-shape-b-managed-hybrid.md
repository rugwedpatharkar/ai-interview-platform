# Deploy Shape B — managed-hybrid (Oracle VM + managed data plane)

**$0/month** alternative to [Shape A](./2026-06-21-deploy-shape-a-self-hosted.md).
The 4 Python services run on **one Oracle ARM VM**, but Mongo / Redis /
RabbitMQ / object storage live in **managed-free providers** (Atlas /
Upstash / CloudAMQP / R2). Frontend on Cloudflare Pages. Same as Shape A.

This shape exists for one reason: **you don't want to operate databases**.
The trade is 5 dashboards + 5 caps to babysit instead of one VM. Read
[deploy-index.md](./2026-06-21-deploy-index.md) before committing — Shape A
is genuinely less work for the same money.

**Time:** 4–5 hours (extra 60–90 min on top of Shape A for the managed-service signups + DNS records).

**Money:** $0/month + ~$10/yr for a domain.

**Scope:** same as Shape A — candidate FE + text-mode backend. Voice deferred.

---

## When Shape B beats Shape A

Pick this if:
- Your team has a hard rule against running databases (audit / compliance).
- You want a Mongo backup story that's "Atlas continuous backup" (paid M10+) ready to flip later.
- You want infra you can show as a "stack diagram" on a CV / case study.
- You're running multiple apps and want to share a Mongo instance across them later.

Pick Shape A instead if:
- You just want it live.
- You don't want to hit Atlas M0's **500-connection cap** (every browser tab + every service connection counts).
- You don't want to hit Upstash's **500 k commands/month** (~16 k/day — the interview state machine burns these).
- You'd rather not get a CloudAMQP email saying "you crossed an undocumented message-count threshold".

## 2026 reality check before you start

| Provider | Free tier cap (verified 2026) | Pain point |
|---|---|---|
| Oracle Ampere A1 (Always Free) | 2 OCPU / 12 GB RAM / 200 GB block | Capacity scarce in some regions |
| MongoDB Atlas **M0** | **512 MB** storage, **500 connections**, **no backups**, 1 cluster/project | Tightest cap in the whole stack — 500 MB hurts fast |
| Upstash Redis Free | **256 MB** data, **500 k commands/mo**, 10 GB bandwidth | Switched from 10 k/day → 500 k/month March 2025 |
| CloudAMQP **Little Lemur** | 100 connections, undocumented monthly message cap | They'll email when you near the cap. |
| Cloudflare R2 | 10 GB storage, 1 M class-A ops, **zero egress** | Best in class — no caveat. |
| Cloudflare Pages | 500 builds/mo, unlimited bandwidth | Plenty. |
| Gemini Flash | 1,500 RPD, 10 RPM, 250 k TPM | Same as Shape A. |

---

## Phase 0 — Prerequisites (~45 min)

Same as Shape A Phase 0, **plus** the four extra managed-service accounts:

| Account | URL | What you'll get |
|---|---|---|
| Oracle Cloud | https://www.oracle.com/cloud/free/ | ARM VM for the 4 Python services |
| Cloudflare | https://dash.cloudflare.com | DNS + Pages + R2 |
| **MongoDB Atlas** | https://www.mongodb.com/cloud/atlas/register | M0 cluster (512 MB shared) |
| **Upstash** | https://upstash.com/sign-up | Free Redis (256 MB) |
| **CloudAMQP** | https://www.cloudamqp.com/signup.html | Little Lemur (free RabbitMQ) |
| Google AI Studio | https://aistudio.google.com/apikey | Gemini API key |
| Resend | https://resend.com/signup | 3 k transactional emails/mo |

All free. CC required only for Oracle.

Buy a domain (`~$10/yr`) — same as Shape A.

---

## Phase 1 — Provision a smaller Oracle VM (~45 min)

Same as [Shape A Phase 1](./2026-06-21-deploy-shape-a-self-hosted.md#phase-1--provision-the-oracle-vm-45-min-mostly-oracles-queue) — pick the **same Ampere A1 shape** but you can use a **smaller slice** since the data plane is offloaded:

| Field | Value |
|---|---|
| **Shape** | VM.Standard.A1.Flex |
| **OCPU** | 1 (instead of 2 — leaves room for a 2nd small instance if you ever want it) |
| **Memory** | 6 GB (instead of 12) |

Or keep the full 2 OCPU / 12 GB — Oracle doesn't bill you either way; this just frees up the rest of your Always Free allowance for a second project later.

Open ports 80 + 443 (same as Shape A). Install Docker (same as Shape A).
Set up the heartbeat cron (same as Shape A).

---

## Phase 2 — Create the managed data plane (~60 min)

### 2.1 MongoDB Atlas M0

1. **Atlas → Create → Free M0 Cluster**.
2. **Provider:** AWS (best regional matches with Oracle's free regions).
3. **Region:** match your Oracle region closely — Ashburn → `us-east-1`, Phoenix → `us-west-2`.
4. **Cluster name:** `aptura-prod` (or whatever).
5. Wait ~5 min for the cluster to provision.

**Database Access:**
- Atlas → Database Access → **Add new database user**.
- **Auth Method:** Password.
- **Username:** `aptura-svc`
- **Password:** generate strong (Atlas's generator is fine). **Save it.**
- **Database User Privileges:** Atlas admin → choose **Read and write to any database**.

**Network Access:**
- Atlas → Network Access → **Add IP Address**.
- Enter **only your Oracle VM's public IP**. NOT `0.0.0.0/0` — that's the lazy-but-insecure default.

**Get the connection string:**
- Atlas → **Connect** → Drivers → Python → copy the URI.
- It looks like: `mongodb+srv://aptura-svc:<PASSWORD>@aptura-prod.xxxxxxx.mongodb.net/?retryWrites=true&w=majority`
- **Save this** — you'll paste into the VM's `.env`.

**Critical:** the 500-connection cap is **per cluster**, shared by **everything** that connects. Our 4 services × pymongo pool size 10 = 40 connections at steady state. A burst test or a debugging dev session can easily push past 500 and start refusing connections. Watch Atlas → Metrics → Connections.

### 2.2 Upstash Redis

1. **Upstash → Redis → Create Database**.
2. **Name:** `aptura-prod`
3. **Type:** Regional (NOT Global — global has different pricing).
4. **Region:** closest to your Oracle VM.
5. **Enable TLS:** ✅ (required).
6. **Eviction:** ✅ Enable.
7. After creation: **Details → REST/Database** → copy the **TLS/SSL connection string** (starts with `rediss://`, double `s` for TLS).

**Save this URL.**

### 2.3 CloudAMQP Little Lemur

1. **CloudAMQP → Create New Instance**.
2. **Plan:** Little Lemur (Free)
3. **Name:** `aptura-prod`
4. **Region:** closest to your Oracle VM (US-East-1 if Ashburn, US-West-2 if Phoenix).
5. After creation: click the instance → **Details** → copy the **AMQP URL** (starts with `amqps://`).

**Save this URL.**

### 2.4 Cloudflare R2 (storage)

Same as [Shape A Phase 9.1](./2026-06-21-deploy-shape-a-self-hosted.md#91-create-r2-bucket), but the bucket holds both the **app assets** (resumes, branding logos) AND **backups**. Use two prefixes:

- `r2:aptura-storage/uploads/` — app assets
- `r2:aptura-storage/backups/` — Mongo dumps

Create the R2 token with read+write on `aptura-storage`. **Save Access Key + Secret.**

Cloudflare R2 has **S3-compatible API** so `lib.storage.ObjectStorage` works
with these env vars:

```ini
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<R2 token access key>
S3_SECRET_ACCESS_KEY=<R2 token secret>
S3_BUCKET=aptura-storage
```

Account ID is on the R2 dashboard top-right.

---

## Phase 3 — Get code on the VM + wire .env (~20 min)

Same as [Shape A Phase 2](./2026-06-21-deploy-shape-a-self-hosted.md#phase-2--get-the-code-on-the-vm-15-min), but `.env` points at managed services instead of localhost:

```bash
ssh ubuntu@<VM_PUBLIC_IP>
cd ~/ai-interview-platform
cp .env.example .env
nano .env
```

```ini
# Generate this on your laptop with: python3 -c 'import secrets; print(secrets.token_hex(32))'
JWT_SECRET=<random hex>

# LLM
GEMINI_API_KEY=<from aistudio.google.com>

# === Data plane — managed providers ===
MONGO_URI=mongodb+srv://aptura-svc:<password>@aptura-prod.xxxxxxx.mongodb.net/aptura?retryWrites=true&w=majority
REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:<port>
RABBITMQ_URL=amqps://<user>:<password>@<host>.cloudamqp.com/<vhost>
RABBITMQ_EXCHANGE=interview

# === Object storage — Cloudflare R2 ===
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<R2 access key>
S3_SECRET_ACCESS_KEY=<R2 secret>
S3_BUCKET=aptura-storage

# These come after Phase 5 / 6
# CORS_ALLOW_ORIGIN=https://app.yourdomain.com
# OAUTH_ALLOWED_REDIRECTS=["https://app.yourdomain.com/auth/callback"]

# Email (Resend) — Phase 8 covers full wiring
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASS=<resend api key>
# SMTP_FROM=noreply@yourdomain.com
```

```bash
chmod 600 .env
```

### Disable the now-unused infra services

The compose file ships Mongo / Redis / RabbitMQ / MinIO / Qdrant containers
that you don't need (we use Atlas / Upstash / CloudAMQP / R2 instead).
Gate them out:

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  mongo:
    profiles: ["unused"]
  redis:
    profiles: ["unused"]
  rabbitmq:
    profiles: ["unused"]
  minio:
    profiles: ["unused"]
  minio-setup:
    profiles: ["unused"]
  qdrant:
    profiles: ["unused"]
  livekit:
    profiles: ["voice"]
  voice-worker:
    profiles: ["voice"]
EOF
```

Now `docker compose up -d` will only start the 4 Python services + nginx.

**Note about Qdrant:** Shape B doesn't have a managed-free Qdrant option that
matches our docker-compose default. The RAG/vector features in `mcp-capability`
will degrade gracefully if Qdrant is missing (returns empty matches), or you
can:
- Spin up Qdrant Cloud's free 1 GB cluster (separate signup), or
- Run Qdrant on the VM anyway (the only container left from the "self-hosted" set — it's the lightest at ~160 MB RAM).

Most teams pick the latter — just remove `qdrant` from the `unused` profile above.

---

## Phase 4 — Launch (~10 min)

```bash
docker compose build admin ai-agents mcp-data mcp-capability
docker compose up -d
docker compose ps
docker compose logs -f --tail=30 admin ai-agents
# Watch for "Application startup complete" on both
```

### Verify each connection

```bash
# Mongo (Atlas)
docker exec interview-platform-admin-1 python -c '
from pymongo import MongoClient
import os
c = MongoClient(os.environ["MONGO_URI"], serverSelectionTimeoutMS=5000)
print("Mongo:", c.admin.command("ping"))
'

# Redis (Upstash)
docker exec interview-platform-admin-1 python -c '
import redis, os
r = redis.Redis.from_url(os.environ["REDIS_URL"])
print("Redis:", r.ping())
'

# RabbitMQ (CloudAMQP)
docker exec interview-platform-admin-1 python -c '
import aio_pika, asyncio, os
async def t():
    c = await aio_pika.connect_robust(os.environ["RABBITMQ_URL"])
    print("RabbitMQ: connected")
    await c.close()
asyncio.run(t())
'

# R2 (S3-compat)
docker exec interview-platform-admin-1 python -c '
import boto3, os
s3 = boto3.client("s3",
    endpoint_url=os.environ["S3_ENDPOINT_URL"],
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
    region_name="auto")
print("R2:", s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"], MaxKeys=1))
'

# App health
curl -sS http://localhost:8080/healthz
curl -sS http://localhost:8081/healthz
curl -sS http://localhost:8080/public/jobs
```

All five checks must return success. If any fail → Phase 11 (troubleshooting)
below.

---

## Phase 5 — Cloudflare DNS + nginx + frontend

Phases 5 (DNS), 6 (Pages), 7 (smoke test), 8 (email), 9 (backups) are
**identical to Shape A**. Open those phases in
[2026-06-21-deploy-shape-a-self-hosted.md](./2026-06-21-deploy-shape-a-self-hosted.md#phase-4--cloudflare-dns--edge-30-min-mostly-dns-propagation)
and follow them as-is. One difference for Phase 9 backups:

### Backup difference: no `docker exec mongodump` (Atlas)

Atlas M0 doesn't expose `mongodump` over the network the way self-hosted Mongo
does. Instead, install `mongodump` on the VM directly and back up the Atlas
cluster:

```bash
# Install Mongo tools (mongodump, mongorestore)
wget -qO- https://www.mongodb.org/static/pgp/server-7.0.asc | sudo tee /etc/apt/trusted.gpg.d/mongodb.asc
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-database-tools

# Daily backup cron
sudo tee /etc/cron.daily/aptura-mongo-backup >/dev/null <<EOF
#!/bin/bash
set -e
STAMP=\$(date -u +%Y-%m-%dT%H-%M)
DUMP=/tmp/mongo-\$STAMP.archive.gz
mongodump --uri="$MONGO_URI" --archive --gzip > "\$DUMP"
sudo -u ubuntu rclone copyto "\$DUMP" "r2:aptura-storage/backups/mongo/\$STAMP.archive.gz"
rm "\$DUMP"
sudo -u ubuntu rclone delete --min-age 14d r2:aptura-storage/backups/mongo
EOF
sudo chmod +x /etc/cron.daily/aptura-mongo-backup
```

**Important:** Atlas M0 is a small shared cluster — `mongodump` can be slow
(several minutes for a few hundred MB). Don't run during business hours.
Default cron.daily fires around 06:25 — fine.

---

## Phase 11 — Troubleshooting (Shape B-specific)

| Symptom | Likely cause | Fix |
|---|---|---|
| `pymongo.errors.ServerSelectionTimeoutError` | Atlas IP allow-list excludes VM IP | Atlas → Network Access → add the exact VM IP (NOT 0.0.0.0/0). Wait 1 min for it to propagate. |
| `pymongo.errors.OperationFailure: bad auth` | Wrong password or username typo | Atlas → Database Access → re-edit the user, set a new password, update `.env`. |
| `redis.exceptions.ConnectionError: Connection reset by peer` | Upstash hit the 500 k/mo cap | Upstash dashboard → check usage. If close to cap, either wait for monthly reset or upgrade (paid tier is $0.20/100 k commands). |
| `aio_pika.exceptions.AMQPConnectionError` | CloudAMQP undocumented monthly message cap reached, or connection cap (100) hit | CloudAMQP dashboard → check the alarms panel. Restart consumers to drop stale connections. |
| `mongodump` fails with "ServerSelectionTimeoutError" | VM's IP changed (Oracle does sometimes reassign) | Update Atlas Network Access entry, restart cron. |
| Atlas connection count climbing toward 500 | pymongo's default pool × every restart | Set `maxPoolSize=5` in connection string: `?maxPoolSize=5&retryWrites=true&w=majority`. |
| Files uploaded to R2 not visible to FE | R2 bucket access policy missing | R2 → bucket → Settings → Public URL Access → enable, OR sign URLs server-side (the lib does this if you configure it). |
| `aio_pika.exceptions.ConnectionClosed` on every job apply | CloudAMQP's TLS heartbeat tighter than RabbitMQ default | In `.env`: `RABBITMQ_HEARTBEAT=30` (or use the URL form `amqps://...?heartbeat=30`). |

### Rollback / disaster recovery

VM recovery is the same as Shape A (provision new VM, repoint DNS).
The **data is safe** because it's in managed services — no Mongo restore
needed for a VM rebuild, just re-`docker compose up`.

If **Atlas M0 itself is wedged** (rare but happens — they restart shared
clusters during maintenance windows):
1. Restore from your latest R2 dump to a new M0 (or, if M0 is the broken
   one, to a temporary throwaway M2 paid cluster).
2. Update `MONGO_URI` on the VM and `docker compose restart`.

---

## Cost trajectory

Free until any of these thresholds:

| Trigger | Free-tier cap | Upgrade | $/mo |
|---|---|---|---|
| Mongo data > 512 MB | Atlas M0 cap | Atlas M2 (shared, 2 GB) | $9 |
| Mongo data > 2 GB | M2 cap | Atlas M10 (dedicated, 10 GB) | $57 |
| Mongo connections > 500 | M0 cap | M10 jumps to 1500 | (same as above) |
| Redis commands > 500 k/mo | Upstash free cap | Pay-as-you-go | $0.20 / 100 k commands |
| RabbitMQ msgs > undocumented cap | Little Lemur | CloudAMQP Tough Tiger | $20/mo |
| R2 storage > 10 GB | R2 free cap | R2 paid | $0.015/GB/mo |
| Pages builds > 500/mo | Cloudflare Pages free | Pages Pro | $5/mo |

The two that hit first in real demos:
- **Atlas's 500-connection cap** (an unaware dev pool burst, a tab leak)
- **Upstash's 500 k/mo cap** (the interview state-machine writes a lot)

Both are easy to spot from the dashboards and easy to upgrade piecewise.

---

## Why Shape A is still our default

A small audit, written after running both on a demo workload:

| Dimension | Shape A (1 VM) | Shape B (managed) |
|---|---|---|
| Setup time to first live | ~3 hours | ~4–5 hours |
| Operating surface | 1 VM, 1 SSH | VM + 4 dashboards + 4 quota emails |
| Capacity ceiling before paying | ~12 GB RAM well-used (1000s of sessions) | Atlas 500-conn cap (~50 active users) |
| Backup story | Cron + R2 (yours to test) | Atlas M0: **no backups** → cron + R2 anyway |
| "I forgot about quota X" risk | None | Five quotas to remember |
| Disaster recovery practice | Restore Mongo dump | Restore Mongo dump |
| Cost when free runs out | $5/mo Mongo M2 | $5/mo Mongo M2 |

The architecture is **already designed** to swap providers via env vars, so
Shape B doesn't even buy you "we'll be ready when we leave free-tier" — you
can do that swap any time without a rewrite. Pick Shape A unless you have a
hard reason against it.

---

## Appendix — env var diff vs Shape A

```diff
# Shape A (.env)
- MONGO_URI=mongodb://mongo:27017
- REDIS_URL=redis://redis:6379/0
- RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
- S3_ENDPOINT_URL=http://minio:9000
- S3_ACCESS_KEY_ID=minioadmin
- S3_SECRET_ACCESS_KEY=minioadmin

# Shape B (.env)
+ MONGO_URI=mongodb+srv://aptura-svc:***@aptura-prod.xxxxxxx.mongodb.net/aptura?retryWrites=true&w=majority&maxPoolSize=5
+ REDIS_URL=rediss://default:***@***.upstash.io:6379
+ RABBITMQ_URL=amqps://***@***.cloudamqp.com/***?heartbeat=30
+ S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
+ S3_ACCESS_KEY_ID=<R2 token access key>
+ S3_SECRET_ACCESS_KEY=<R2 token secret>
```

Everything else (CORS, JWT, Gemini, voice) is identical to Shape A.
