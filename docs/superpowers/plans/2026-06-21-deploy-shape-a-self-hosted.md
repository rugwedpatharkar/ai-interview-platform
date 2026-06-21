# Deploy Shape A — single Oracle ARM VM, self-hosted infra

**$0/month** end-to-end deployment. One Oracle Always Free ARM VM runs the full
`docker compose up` (4 Python services + Mongo + Redis + RabbitMQ + Qdrant +
MinIO). Frontend on Cloudflare Pages. DNS + SSL via Cloudflare. Backups to R2.

This is the recommended shape (see [deploy-index.md](./2026-06-21-deploy-index.md)).

**Time:** 3–4 hours for a clean first deploy. Most of the wait is Oracle's
instance-creation queue, DNS propagation, and the first frontend build.

**Money:** $0/month + ~$10/yr for a domain name. Nothing else.

**Scope:** Candidate frontend + full text-mode backend. Voice interview deferred
to Phase 10.

---

## 2026 reality check before you start

| Provider | Cap that matters | Refreshed |
|---|---|---|
| Oracle Always Free ARM (VM.Standard.A1.Flex) | **2 OCPU / 12 GB RAM / 200 GB block storage** (downgraded June 15, 2026 from 4/24) | Verified |
| Cloudflare Pages | 500 builds/mo, unlimited bandwidth, 1 concurrent build | Verified |
| Cloudflare R2 | 10 GB storage, **zero egress**, 1 M class-A ops/mo | Verified |
| Gemini API (Flash) | 1,500 req/day (RPD), 10 RPM, 250 k TPM | Verified May 2026 |
| Resend email | 3,000/mo (transactional) | Verified |

Our idle stack measured: ~1.2 GB RAM, ~5 % of 1 core. Fits the 12 GB cap with
10× headroom. **Don't go above the new cap or Oracle shuts the instance down.**

---

## Phase 0 — Prerequisites (~30 min)

Get all of this in hand before Phase 1. Most are signup-only, no install.

### 0.1 Accounts

| Account | URL | Notes |
|---|---|---|
| **Oracle Cloud** | https://www.oracle.com/cloud/free/ | **Real credit card required at signup** (never charged unless you opt to paid). Pick your **home region** carefully — *permanent*, can't change later. US East (Ashburn) and US West (Phoenix) have the most ARM capacity. |
| **Cloudflare** | https://dash.cloudflare.com/sign-up | Free plan covers DNS + Pages + R2 + edge SSL. |
| **GitHub** | — | Already exists. You'll add a read-only deploy key to the repo. |
| **Google AI Studio** | https://aistudio.google.com/apikey | No card required for Flash. **Create the API key, save it.** |
| **Resend** | https://resend.com/signup | 3,000 emails/mo free. Verify your domain in Phase 4 — until then, you can only send to your own email. |

### 0.2 Domain name (the only thing you pay for)

Buy from any registrar; cheapest two:
- **Cloudflare Registrar** — at-cost (~$10/yr for `.com`, less for `.app`/`.dev`/`.xyz`). Most convenient since DNS lives at Cloudflare too.
- **Porkbun** / **Namecheap** — comparable price, easy nameserver transfer to Cloudflare.

For this guide assume your domain is `yourdomain.com`. You'll point:
- `app.yourdomain.com` → Cloudflare Pages (frontend)
- `api.yourdomain.com` → Oracle VM (backend)

### 0.3 Local tools on your laptop

```bash
# macOS
brew install git docker pnpm

# Linux
sudo apt install -y git curl
# Docker per https://docs.docker.com/engine/install/
# pnpm: npm install -g pnpm@9.15.0
```

You'll use Docker locally only to verify the FE build before pushing. The VM
will run docker too, but installs it from the official repo.

---

## Phase 1 — Provision the Oracle VM (~45 min, mostly Oracle's queue)

### 1.1 Create the instance

Sign in to Oracle Cloud Console → **Compute → Instances → Create Instance**:

| Field | Value | Why |
|---|---|---|
| **Name** | `aptura-prod` | Anything. |
| **Image** | Canonical Ubuntu **22.04** | NOT 24.04 — docker repo keys differ and you'll fight signing-key errors. |
| **Shape** | Change shape → **Ampere** → **VM.Standard.A1.Flex** | ARM Always-Free shape. |
| **OCPU** | **2** | New cap (was 4 until June 15, 2026). |
| **Memory** | **12 GB** | New cap (was 24 GB until June 15, 2026). |
| **Networking** | Use the default VCN it offers. Assign public IPv4. | Cloudflare proxy needs reachable IP. |
| **SSH keys** | Upload the .pub from `ssh-keygen -t ed25519 -f ~/.ssh/aptura` | Use a dedicated key. |
| **Boot volume** | Default 47 GB | Largest free-tier disk. Don't reduce. |

The shape selector must show the **"Always-Free-eligible"** badge — if it
doesn't, you've picked the wrong size. The shape selector won't even *let* you
go above 2/12 on Always Free.

Click **Create**. Wait 1–5 min for `RUNNING`. **Copy the public IP** — you'll need it everywhere.

> **If you get "out of capacity":** retry every 30 min for a day or two — Oracle
> capacity opens and closes. US East (Ashburn) and US West (Phoenix) have the
> best availability. If your home region is genuinely starved (Singapore /
> Tokyo / Sydney often are), create a free tenancy in a different region —
> Always Free is per-tenancy, not per-account, so a fresh tenancy in Ashburn
> avoids the wait.

### 1.2 Open the public ports

Default VCN only allows SSH. Add HTTP + HTTPS for Cloudflare to reach the VM.

**VCN → Virtual Cloud Networks → (your VCN) → Subnet → Security Lists → Default Security List → Add Ingress Rules:**

| Source CIDR | Protocol | Destination Port | Description |
|---|---|---|---|
| `0.0.0.0/0` | TCP | 80 | HTTP (Cloudflare → VM, then 443 via Cloudflare edge) |
| `0.0.0.0/0` | TCP | 443 | HTTPS (only used if you later switch to Full SSL — leave open) |

**Do NOT** expose Mongo (27017), Redis (6379), RabbitMQ (5672/15672), MinIO
(9000/9001), Qdrant (6333/6334), or the service ports (8080/8081/8100/8101)
to the public internet. They all bind to the docker network and stay private.

### 1.3 First SSH + harden the OS

```bash
ssh -i ~/.ssh/aptura ubuntu@<VM_PUBLIC_IP>

# OS up to date
sudo apt update && sudo apt -y full-upgrade

# Firewall + intrusion-prevention + autopatch
sudo apt install -y ufw fail2ban unattended-upgrades curl git
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades  # accept defaults
```

### 1.4 Install Docker (from the official repo — distro `docker.io` is too old)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker        # apply group without re-login
docker --version     # 27.x or newer
docker compose version  # v2.x
```

### 1.5 Anti-reclaim cron (Oracle reclaims "idle" ARM VMs)

Oracle's policy: any Always Free ARM VM that stays below **20% CPU for 7 consecutive days** is flagged for reclamation. A trivial heartbeat keeps it visible:

```bash
sudo tee /etc/cron.hourly/aptura-heartbeat >/dev/null <<'EOF'
#!/bin/sh
# Hourly disk write + brief CPU burst to keep Oracle's reclaim policy happy.
date -u +%FT%TZ >> /var/log/aptura-heartbeat.log
df -h / | tail -1 >> /var/log/aptura-heartbeat.log
# 5-second CPU sample
yes > /dev/null & PID=$!; sleep 5; kill $PID
EOF
sudo chmod +x /etc/cron.hourly/aptura-heartbeat
```

---

## Phase 2 — Get the code on the VM (~15 min)

### 2.1 Generate a GitHub deploy key (read-only)

On the VM:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N ""  # no passphrase
cat ~/.ssh/github-deploy.pub
```

In GitHub: **repo → Settings → Deploy keys → Add deploy key**:
- Title: `aptura-prod-vm`
- Key: paste the .pub
- ✅ **Allow read access** (DO NOT check "Allow write access")

Back on the VM:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github-deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

git clone git@github.com:rugwedpatharkar/ai-interview-platform.git
cd ai-interview-platform
git log --oneline -3  # sanity: should show current main
```

### 2.2 Create production `.env`

```bash
cp .env.example .env

# Generate a strong JWT secret (32 bytes hex)
python3 -c 'import secrets; print(secrets.token_hex(32))'
# → copy the output

nano .env
```

Required keys (fill these now):

```ini
JWT_SECRET=<paste the python output above>
GEMINI_API_KEY=<from aistudio.google.com/apikey>

# Leave these for Phase 4 after you have the domain wired:
# CORS_ALLOW_ORIGIN=https://app.yourdomain.com
# OAUTH_ALLOWED_REDIRECTS=["https://app.yourdomain.com/auth/callback"]

# Leave LIVEKIT_*, GROQ_API_KEY blocks empty — voice is Phase 10.

# Optional: real email (Resend) — Phase 7 covers full wiring.
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASS=<from resend.com dashboard>
# SMTP_FROM=noreply@yourdomain.com
```

```bash
chmod 600 .env  # never world-readable
```

---

## Phase 3 — Launch the backend stack (~25 min, first build ~10 min)

### 3.1 Gate the voice path out (deferred to Phase 10)

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  livekit:
    profiles: ["voice"]
  voice-worker:
    profiles: ["voice"]
EOF
```

These services now only start when you `--profile voice`. They stay dormant
for the text-only launch.

### 3.2 Cap Mongo memory (avoid OOM on the 12 GB VM)

Default `mongod` grabs **(½ × RAM − 1 GB)** for the WiredTiger cache → ~5 GB on
a 12 GB box. That's wasteful for an early-stage product. Cap it:

```bash
# Append to docker-compose.override.yml:
cat >> docker-compose.override.yml <<'EOF'
  mongo:
    command: --wiredTigerCacheSizeGB 1
EOF
```

### 3.3 Build + bring up

```bash
# Build the 4 Python service images (~8 min first time; cached after)
docker compose build admin ai-agents mcp-data mcp-capability

# Bring up infra + services (skips the voice profile)
docker compose up -d

# Wait for healthy
docker compose ps
docker compose logs -f --tail=30 admin ai-agents
# Ctrl-C the tail once you see "Application startup complete" on both
```

### 3.4 Verify the stack

```bash
# Admin REST health probe
curl -sS http://localhost:8080/healthz
# {"status":"ok",...}

# Public marketplace search (the endpoint we fixed in commit e9d411b)
curl -sS http://localhost:8080/public/jobs | python3 -m json.tool | head -20
# Should return {"jobs":[],...} on a fresh DB.

# ai-agents
curl -sS http://localhost:8081/healthz

# Health by service
docker compose ps --format json | python3 -c '
import json,sys
for s in json.load(sys.stdin):
    print(f"{s[\"Service\"]:20} {s.get(\"Health\",\"-\")}")
'
```

All five infra services (`mongo`, `redis`, `rabbitmq`, `qdrant`, `minio`)
should show `healthy` or `running`. All four app services (`admin`,
`ai-agents`, `mcp-data`, `mcp-capability`) should be `running`.

> **If `public/jobs` 500s:** that was the pymongo-async aggregate bug fixed in
> commit `e9d411b`. Verify the running code has that fix:
> `git log --oneline -10 | grep aggregate`.

### 3.5 Seed a test admin

```bash
python3 scripts/smoke_login.py
# Registers a candidate + a recruiter + posts a sample job.
```

---

## Phase 4 — Cloudflare DNS + edge (~30 min, mostly DNS propagation)

### 4.1 Move DNS to Cloudflare

1. Cloudflare Dashboard → **Add a site** → enter `yourdomain.com` → choose **Free** plan.
2. Cloudflare gives you 2 nameservers (e.g. `chad.ns.cloudflare.com`, `lisa.ns.cloudflare.com`).
3. At your registrar: replace the nameservers with Cloudflare's two. **Wait 15 min – 24 h** for propagation.

Verify propagation:

```bash
dig NS yourdomain.com  # should list both Cloudflare nameservers
```

### 4.2 Add the DNS records

Cloudflare → DNS → Records → **Add record**:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `api` | `<VM_PUBLIC_IP>` | **Proxied (orange cloud)** | Auto |
| CNAME | `app` | placeholder (`yourdomain.com`) | Proxied | Auto |

The CNAME for `app` will be overwritten by Cloudflare Pages in Phase 6 when
you bind the custom domain — leave it pointing at the root for now.

### 4.3 SSL mode

Cloudflare → **SSL/TLS → Overview**:
- Set **Flexible** for now (browser ↔ CF is HTTPS, CF ↔ VM is HTTP on port 80).
- This works immediately with **no certs on the VM**.
- After Phase 7 you can install a Cloudflare Origin cert on the VM and flip to **Full (strict)**. Skipping is fine for the first live demo.

### 4.4 Wire admin to the public domain (CORS + OAuth redirect allow-list)

On the VM:

```bash
cd ~/ai-interview-platform
nano .env
```

Edit:

```ini
CORS_ALLOW_ORIGIN=https://app.yourdomain.com
OAUTH_ALLOWED_REDIRECTS=["https://app.yourdomain.com/auth/callback"]
```

```bash
docker compose up -d admin ai-agents
# CORS settings are read at startup; restart picks them up.
```

### 4.5 Put nginx in front for path-routing (optional but recommended)

This lets the FE call **one** origin (`api.yourdomain.com`) for both `admin`
and `ai-agents` endpoints. Without it, you need two subdomains.

```bash
cat > docker-compose.nginx.yml <<'EOF'
services:
  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports: ["80:80"]
    depends_on: [admin, ai-agents]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
EOF

cat > nginx.conf <<'EOF'
server {
  listen 80 default_server;
  server_name _;

  # gRPC-web is plain HTTP/1.1 — Cloudflare's free proxy passes it cleanly.
  client_max_body_size 25M;  # branding logo upload ceiling

  # ai-agents goes to /agents/* (rewritten to root on the upstream)
  location /agents/ {
    proxy_pass http://ai-agents:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;          # SSE-shaped streaming
    proxy_read_timeout 600s;
  }

  # Everything else → admin
  location / {
    proxy_pass http://admin:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_read_timeout 600s;
  }
}
EOF

docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.nginx.yml up -d nginx
```

Test:

```bash
# Local
curl -H "Host: api.yourdomain.com" http://localhost/public/jobs

# Public (after DNS propagation):
curl https://api.yourdomain.com/public/jobs
```

You should see the same `{"jobs":[],...}` from both. If the public hit 502s,
check Cloudflare → SSL/TLS → Overview is on **Flexible** (not Off).

---

## Phase 5 — Wire the frontend to the public API (~15 min)

On your **laptop** (not the VM):

```bash
cd ~/Projects/ai-interview-platform
git pull
cd frontend/apps/candidate

# Production env (committed to git so Cloudflare Pages picks it up)
cat > .env.production <<'EOF'
NEXT_PUBLIC_ADMIN_URL=https://api.yourdomain.com
NEXT_PUBLIC_AI_AGENTS_URL=https://api.yourdomain.com/agents
NEXT_PUBLIC_MOCK=0
EOF

# Sanity-build locally so Cloudflare Pages doesn't fail on first push
cd ../..
npx pnpm@9.15.0 install
npx pnpm@9.15.0 --filter @ip/candidate build
# Should end with the route-size table, EXIT 0.

git add apps/candidate/.env.production
git commit -m "chore(deploy): wire candidate FE at api.yourdomain.com"
git push
```

---

## Phase 6 — Cloudflare Pages (~15 min + first build ~8 min)

### 6.1 Connect repo

Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**:
- Authorize Cloudflare to read your repo.
- Select `rugwedpatharkar/ai-interview-platform`.
- **Production branch:** `main`.
- **Framework preset:** *None* (Cloudflare's Next.js preset is too opinionated for our monorepo — we'll set commands explicitly).
- **Build command:**
  ```
  cd frontend && npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @ip/candidate build
  ```
- **Build output directory:** `frontend/apps/candidate/.next`
- **Root directory:** *(leave blank — repo root)*

**Environment variables (Production):**

| Name | Value |
|---|---|
| `NEXT_PUBLIC_ADMIN_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_AI_AGENTS_URL` | `https://api.yourdomain.com/agents` |
| `NEXT_PUBLIC_MOCK` | `0` |
| `NODE_VERSION` | `20` |

Click **Save and Deploy**. First build ~8 min (subsequent ~3 min).

### 6.2 Bind the custom domain

Pages project → **Custom domains → Set up a custom domain** → enter `app.yourdomain.com`.

Cloudflare auto-replaces the placeholder CNAME you set in Phase 4.2. SSL is automatic.

Visit `https://app.yourdomain.com` — you should see the marketing landing.

---

## Phase 7 — End-to-end smoke test (~10 min)

Walk these in order on the live site:

1. **Marketing landing renders** at `/`. Open devtools — no console errors, no failed network requests.
2. **Register a candidate** at `/register`.
3. **Dashboard** shows "Welcome back, *(email local-part)*." NOT a raw ObjectId. (Confirms commit `1f0f902` email-in-JWT is live.)
4. **Browse jobs** at `/jobs` — empty state OK if no company seeded; the smoke_login script seeded one.
5. **Register a company** at `/company/register`.
6. **`/company/branding`** loads the editable form. NOT a "Not found" page. (Confirms commit `43f6210` NOT_FOUND-handling is live.)
7. **Post a job** at `/company/jobs/new` → save → publish.
8. **Sign back in as the candidate**, see the role in `/jobs`, click → apply.
9. **Sign back in as the company**, see the applicant on the job's applicants tab.

If any step fails → **Phase 11 troubleshooting** below.

---

## Phase 8 — Email (Resend, ~15 min)

Without real SMTP, verification emails are written to the admin log only.
Wire Resend for working email.

### 8.1 Set up Resend domain

Resend Dashboard → **Domains → Add Domain** → `yourdomain.com`.

Resend gives you 3 DNS records (TXT for SPF, MX for inbound, DKIM CNAMEs).
Add them at Cloudflare → DNS. **Important:** set the proxy to **DNS-only (grey
cloud)** on MX records — orange cloud breaks email.

Wait 5–15 min for verification.

### 8.2 Add SMTP creds to the VM

Resend Dashboard → **API Keys → Create API key** (full access). Then on the VM:

```bash
cd ~/ai-interview-platform
nano .env
```

```ini
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<the resend API key>
SMTP_FROM=noreply@yourdomain.com
```

```bash
docker compose up -d admin ai-agents
```

Test: register a new candidate → check your inbox for the verify link.

---

## Phase 9 — Backups (R2 + cron, ~20 min)

### 9.1 Create R2 bucket

Cloudflare → **R2 → Create bucket** → name `aptura-backups` → location: same continent as your VM.

R2 → **Manage R2 API Tokens → Create API token**:
- Permissions: **Object Read & Write**
- Specify bucket: `aptura-backups`
- Save **Access Key ID** + **Secret Access Key**.

### 9.2 Install rclone on the VM

```bash
sudo apt install -y rclone
rclone config
```

Interactive flow:
- `n` (new remote) → name: `r2`
- Storage: `s3`
- Provider: `Cloudflare`
- Access key: `<R2 token access key>`
- Secret access key: `<R2 token secret>`
- Region: `auto`
- Endpoint: `https://<your-account-id>.r2.cloudflarestorage.com` (account ID from R2 dashboard)
- Leave everything else default
- `q` to quit config

```bash
rclone lsd r2:  # should list aptura-backups
```

### 9.3 Daily Mongo dump → R2

```bash
sudo tee /etc/cron.daily/aptura-mongo-backup >/dev/null <<'EOF'
#!/bin/bash
set -e
STAMP=$(date -u +%Y-%m-%dT%H-%M)
DUMP=/tmp/mongo-$STAMP.archive.gz
docker exec interview-platform-mongo-1 mongodump --archive --gzip > "$DUMP"
sudo -u ubuntu rclone copyto "$DUMP" "r2:aptura-backups/mongo/$STAMP.archive.gz"
rm "$DUMP"
# Retention: keep 14 daily dumps
sudo -u ubuntu rclone delete --min-age 14d r2:aptura-backups/mongo
EOF
sudo chmod +x /etc/cron.daily/aptura-mongo-backup

# Run once now to seed
sudo /etc/cron.daily/aptura-mongo-backup
rclone ls r2:aptura-backups/mongo  # should list the first dump
```

14 daily dumps × ~50 MB each = ~700 MB, well under R2's 10 GB free tier.

---

## Phase 10 (later) — Voice interview path

Skip on first deploy. When you add it:

### 10.1 Open WebRTC ports

Oracle VCN security list → add ingress:

| Source | Protocol | Port range |
|---|---|---|
| `0.0.0.0/0` | TCP | 7880 (LiveKit signaling) |
| `0.0.0.0/0` | TCP | 7881 (LiveKit TCP fallback) |
| `0.0.0.0/0` | UDP | 51000-51019 (LiveKit media) |

VM firewall:

```bash
sudo ufw allow 7880:7881/tcp
sudo ufw allow 51000:51019/udp
```

### 10.2 Wire LiveKit Cloud (easier than self-host behind Cloudflare)

LiveKit Cloud free **Build plan** gives 5,000 WebRTC-min/mo, 1,000 agent-min/mo,
100 concurrent connections. Behind Cloudflare's orange-cloud proxy, self-hosted
WebRTC NAT-traverses badly — pay the dashboard tax, save the debugging.

LiveKit Cloud → **Create Project** → copy URL/key/secret.

On the VM:

```bash
nano .env
```

```ini
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=<from livekit dashboard>
LIVEKIT_API_SECRET=<from livekit dashboard>
GROQ_API_KEY=<from console.groq.com>
```

```bash
# Enable the voice profile
docker compose --profile voice up -d voice-worker
# (Skip the local `livekit` container — using cloud)
```

---

## Phase 11 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/public/jobs` returns 500 | aggregate-cursor regression | `git log --oneline \| grep aggregate` — should show `e9d411b`. If missing: `git pull && docker compose build admin && docker compose up -d admin` |
| `CORS error` on every API call | `CORS_ALLOW_ORIGIN` mismatch | `.env` must include the exact frontend origin **with scheme**. `https://app.yourdomain.com`, not `app.yourdomain.com`. After fix: `docker compose up -d admin ai-agents` |
| Dashboard shows raw ObjectId | running pre-`1f0f902` admin image | `git pull && docker compose build admin && docker compose up -d admin` |
| `/company/branding` says "Not found" | running pre-`43f6210` FE | Redeploy in Cloudflare Pages (Deployments → ⋯ → Retry deployment) |
| Pages build fails with "Cannot find module 'next'" | wrong NODE_VERSION | Set `NODE_VERSION=20` env var in Pages settings → Retry |
| Pages build fails with "ENOSPC: no space left" | cache bloat | Pages → Settings → Builds & deployments → Clear build cache → Retry |
| 502 from `api.yourdomain.com` | Cloudflare SSL mode wrong or nginx not running | SSL mode = Flexible; `docker compose ps nginx` |
| ai-agents not consuming from RabbitMQ | container restart didn't reconnect | `docker compose restart ai-agents` |
| Mongo container OOM-killed | cache cap not applied | Verify `docker-compose.override.yml` includes the `--wiredTigerCacheSizeGB 1` command + `docker compose up -d mongo` |
| Oracle "out of capacity" creating ARM VM | regional capacity exhausted | Retry every 30 min; or create a tenancy in Ashburn/Phoenix |
| Random "Address already in use" on port 80 | something else is on 80 | `sudo lsof -i :80` to find the other listener |

### Rollback a bad release

```bash
cd ~/ai-interview-platform
git log --oneline -10           # find the last good SHA
git checkout <good-sha>
docker compose build admin ai-agents mcp-data mcp-capability
docker compose up -d
```

Cloudflare Pages: project → Deployments → previous good deploy → **Rollback to this deployment**.

### Disaster recovery — VM is gone

1. Phases 1 + 2 + 3 fresh (~1 hour).
2. Restore latest Mongo dump:
   ```bash
   STAMP=2026-06-20T03-00  # whichever dump is latest in R2
   rclone copyto r2:aptura-backups/mongo/$STAMP.archive.gz /tmp/restore.gz
   docker exec -i interview-platform-mongo-1 mongorestore --archive --gzip --drop < /tmp/restore.gz
   ```
3. Update Cloudflare DNS `api.yourdomain.com` → new VM IP (1-line edit, ~1 min via Cloudflare).

**Recovery time:** ~1 hour with backups in hand.

---

## Phase 12 — Operations runbook (ongoing)

### Daily

- Nothing. The cron handles backups.

### After every code merge to `main`

```bash
ssh ubuntu@<VM_PUBLIC_IP>
cd ai-interview-platform
git pull
docker compose build admin ai-agents mcp-data mcp-capability
docker compose up -d
# Cloudflare Pages auto-rebuilds FE on the same push.
```

### Monthly

- Cloudflare → check Pages build count (cap 500/mo; we use ~10).
- Oracle → check billing dashboard reads $0.00.
- Resend → check email count (cap 3,000/mo).
- R2 → check bucket size (cap 10 GB; backups will be ~700 MB).

### Quarterly

- Rotate `JWT_SECRET` (logs everyone out — schedule with the team).
- Regenerate Gemini API key.
- Rotate Resend API key.
- Verify Mongo dumps actually restore (test on a throwaway VM).

---

## Total cost summary

| Item | Recurring |
|---|---|
| Domain | ~$10/yr (one time per year) |
| Everything else | **$0/month** |

Sustainable until:
- Gemini Flash 1,500 RPD becomes a real bottleneck (~50 active candidate sessions/day)
- Mongo on the VM hits 47 GB disk (~1M applications, 10s of GB of resumes)
- Email volume > 3,000/mo (Resend → upgrade or switch)
- VM RAM saturated at ~9 GB used (1000s of concurrent sessions)

When any of those hit, [DEPLOYMENT.md](./DEPLOYMENT.md) has the upgrade path
(managed Mongo, paid Gemini, scaled compute) — nothing in this shape
paints you into a corner.

---

## Appendix — Files this plan touches

Existing (in the repo):
- [docker-compose.yml](../../../docker-compose.yml)
- [docker/Dockerfile](../../../docker/Dockerfile)
- [.env.example](../../../.env.example)
- [scripts/smoke_login.py](../../../scripts/smoke_login.py)

Created on the VM (not committed):
- `~/ai-interview-platform/.env`
- `~/ai-interview-platform/docker-compose.override.yml`
- `~/ai-interview-platform/docker-compose.nginx.yml`
- `~/ai-interview-platform/nginx.conf`
- `/etc/cron.daily/aptura-mongo-backup`
- `/etc/cron.hourly/aptura-heartbeat`

Created/committed locally (in the repo):
- `frontend/apps/candidate/.env.production`

Created in cloud dashboards:
- Cloudflare Pages project + custom domain `app.yourdomain.com`
- Cloudflare DNS A record `api.yourdomain.com` (orange-cloud) + CNAME `app`
- Cloudflare R2 bucket `aptura-backups` + API token
- Resend domain `yourdomain.com` + API key
- Google AI Studio Gemini API key
