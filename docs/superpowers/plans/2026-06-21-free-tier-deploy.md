# Free-tier deployment plan — 2026-06-21

End-to-end runbook to put **Aptura** live on the internet for **$0/month**.
Shape A from [DEPLOYMENT.md](./DEPLOYMENT.md): one always-free Oracle ARM VM
runs the whole backend stack (`docker compose up`), Cloudflare Pages serves
the frontend, Cloudflare DNS handles SSL + edge.

**Scope:** the candidate app + the full backend (admin, ai-agents,
mcp-data, mcp-capability) + infra (Mongo, Redis, RabbitMQ, Qdrant, MinIO).
Voice interview (LiveKit + voice-worker + Groq) is **deferred** — it adds
WebRTC complexity (UDP NAT, TURN) that doubles the deploy time. Wire after
the first text-only end-to-end run is live.

**Time budget:** 3–4 hours for a first-time deploy. Most of it is waiting
on Oracle's instance creation queue and DNS propagation.

**Money budget:** $0 forever, conditional on:
- Oracle keeps the always-free tier alive (no announced sunset).
- A real credit card on file at Oracle signup (no charge unless you opt up).
- A registered domain name — that's the **only** unavoidable cost. ~$10/year
  on Namecheap / Porkbun / Cloudflare Registrar. Use a `.app` / `.dev` / `.xyz`
  to stay under $15/yr.

---

## Phase 0 — Prerequisites (30 min)

Get these in hand BEFORE touching the VM:

| Item | Where | Notes |
|---|---|---|
| **Oracle Cloud account** | https://www.oracle.com/cloud/free/ | Real credit card required; **never** charged unless you opt to a paid tier. Pick "Home Region" close to your users — it's PERMANENT, can't change later. |
| **Domain name** | Cloudflare Registrar / Namecheap | Cloudflare Registrar is at-cost (cheapest); transfer-in is free. |
| **Cloudflare account** | https://cloudflare.com | Free plan covers DNS, SSL, Pages, R2. |
| **GitHub account** | — | You already have one. Repo must be pushable to (for Cloudflare Pages auto-deploy). |
| **Gemini API key** | https://aistudio.google.com/apikey | Free tier; no card required. Save the key, you'll paste it later. |
| **SMTP provider key** (optional now, needed for verify emails) | Brevo (300/day) or Resend (100/day) | Skip for first deploy if you don't mind manual `email_verified=true` in Mongo. |
| **Local machine:** `ssh`, `git`, `docker`, `pnpm` | — | Only for testing the build before pushing. |

---

## Phase 1 — Provision the VM (45 min, mostly waiting)

### 1.1 Create the instance

In Oracle Cloud Console:

1. **Compute → Instances → Create Instance**
2. **Name:** `aptura-prod`
3. **Image:** Canonical Ubuntu **22.04** (NOT 24.04 — fewer surprises with docker repo keys)
4. **Shape:** Change shape → **Ampere** → **VM.Standard.A1.Flex**
   - **OCPU:** 4 *(max free)*
   - **Memory:** 24 GB *(max free)*
   - *Always-Free-eligible* badge should appear. If it says "out of capacity"
     in your region, retry in 30-min cycles for a day or two — capacity
     opens up. This is the **#1 reason** people give up on this path.
5. **Networking:** Use the default VCN it offers to create. Assign a public IPv4.
6. **SSH keys:** Generate locally (`ssh-keygen -t ed25519 -f ~/.ssh/aptura`), upload the `.pub`.
7. **Boot volume:** Default 47 GB is fine (largest the free tier gives).

Click Create. Wait 1–5 min for `RUNNING`. Note the **public IP**.

### 1.2 Open the network ports

The default VCN only opens SSH. We need 80 and 443 for HTTP/HTTPS.

**VCN → Security Lists → Default Security List** → **Add Ingress Rules:**

| Source | Protocol | Port | Description |
|---|---|---|---|
| `0.0.0.0/0` | TCP | 80 | HTTP (redirects to HTTPS) |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

**Do NOT** open Mongo (27017), Redis (6379), RabbitMQ (5672), MinIO (9000), or
the service ports (8080/8081/8100/8101) to the public internet — they bind
to `localhost` via the Cloudflare proxy chain.

### 1.3 First SSH + harden

```bash
ssh -i ~/.ssh/aptura ubuntu@<VM_PUBLIC_IP>

# OS update + firewall + basics
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban git curl unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable --now fail2ban
```

### 1.4 Install Docker

```bash
# Official docker repo (NOT distro docker.io — too old for compose v2)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker     # apply group without re-login
docker --version  # 24.x or newer
docker compose version  # v2.x
```

### 1.5 Anti-reclaim cron

Oracle reclaims "idle" ARM VMs (technically: <20% CPU for 7 days). Trivial
heartbeat keeps it warm:

```bash
sudo tee /etc/cron.hourly/aptura-heartbeat >/dev/null <<'EOF'
#!/bin/sh
date -u +%FT%TZ >> /var/log/aptura-heartbeat.log
df -h / | tail -1 >> /var/log/aptura-heartbeat.log
EOF
sudo chmod +x /etc/cron.hourly/aptura-heartbeat
```

---

## Phase 2 — Get the code on the box (15 min)

### 2.1 Clone (read-only deploy key)

On the VM:

```bash
# Generate a deploy key WITH NO PASSPHRASE
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N ""
cat ~/.ssh/github-deploy.pub
```

In GitHub: **repo → Settings → Deploy keys → Add deploy key**, paste it,
**Read-only** is sufficient.

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
git log --oneline -3  # sanity
```

### 2.2 Create the production `.env`

```bash
cp .env.example .env

# Generate a strong JWT secret (32+ bytes hex)
python3 -c 'import secrets; print(secrets.token_hex(32))' >> /tmp/jwt
JWT=$(cat /tmp/jwt) && rm /tmp/jwt

# Open with nano/vim and fill:
nano .env
```

Required keys to fill:

```ini
JWT_SECRET=<paste the python output above>
GEMINI_API_KEY=<from aistudio.google.com/apikey>

# Set these AFTER you pick the domain in phase 5.
# CORS_ALLOW_ORIGIN=https://app.yourdomain.com
# OAUTH_ALLOWED_REDIRECTS=["https://app.yourdomain.com/auth/callback"]

# Leave the LIVEKIT_*, GROQ_API_KEY blocks empty for now (voice deferred).
```

---

## Phase 3 — Launch the backend stack (20 min)

### 3.1 Pre-flight check

```bash
# Single-line sanity that compose parses cleanly
docker compose config >/dev/null && echo OK

# Voice path is OUT OF SCOPE for v1 — drop livekit + voice-worker from this run.
# Either edit docker-compose.yml to comment those services, or use --scale to skip:
SKIP="livekit voice-worker"

# Easier: profile out via an override file
cat > docker-compose.override.yml <<'EOF'
services:
  livekit:
    profiles: ["voice"]
  voice-worker:
    profiles: ["voice"]
EOF
```

### 3.2 Build + bring it up

```bash
# Build the 4 Python service images (~10 min first time; cached after)
docker compose build admin ai-agents mcp-data mcp-capability

# Bring up infra + services (skips the "voice" profile services we just gated)
docker compose up -d

# Watch for healthy
docker compose ps
docker compose logs -f --tail=50 admin ai-agents
# Ctrl-C the tail once you see "Application startup complete" on both
```

### 3.3 Verify the stack is alive

```bash
# Admin's REST health (NOT gRPC — public probe)
curl -sS http://localhost:8080/healthz

# Public marketplace (the endpoint we fixed in commit e9d411b)
curl -sS http://localhost:8080/public/jobs | python3 -m json.tool | head -20

# ai-agents health
curl -sS http://localhost:8081/healthz

# RabbitMQ + Mongo + Redis healthchecks
docker compose ps --format json | python3 -c 'import json,sys; [print(s["Service"], s["Health"]) for s in json.load(sys.stdin)]'
```

If `public/jobs` is empty `{"jobs":[],...}` — that's correct (no jobs seeded
yet). If it 500s, jump to **Troubleshooting** below.

### 3.4 Seed a first admin user (for testing)

```bash
# Via the REST proxy (one-shot script the repo ships)
python3 scripts/smoke_login.py
# Or: register through the FE once it's up (phase 6).
```

---

## Phase 4 — Cloudflare front door (30 min, mostly DNS propagation)

### 4.1 Move DNS to Cloudflare

1. Cloudflare Dashboard → **Add a site** → enter `yourdomain.com` → Free plan.
2. Cloudflare gives you 2 nameservers (e.g. `chad.ns.cloudflare.com`).
3. At your registrar: replace the nameservers with Cloudflare's. **Wait 15–60 min**
   for `dig NS yourdomain.com` to flip.

### 4.2 DNS records

In Cloudflare → DNS → Records:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | `<VM_PUBLIC_IP>` | **Proxied (orange cloud)** |
| CNAME | `app` | (filled in Phase 6 by Cloudflare Pages) | Proxied |

The orange cloud is what gives you free SSL + DDoS shield + a real
CDN. The VM never needs Let's Encrypt; Cloudflare terminates HTTPS at
the edge and talks HTTP to your VM on port 80.

### 4.3 Flex SSL → Full SSL when ready

Cloudflare → **SSL/TLS → Overview**:
- Set mode to **Flexible** for now (browser↔CF is HTTPS, CF↔VM is HTTP).
  This works today with no certs on the VM.
- Once Phase 7 is done, install a Cloudflare Origin certificate on the VM
  and switch to **Full (strict)**.

### 4.4 Wire admin to the public domain

On the VM:

```bash
cd ~/ai-interview-platform
nano .env
# Edit:
CORS_ALLOW_ORIGIN=https://app.yourdomain.com
OAUTH_ALLOWED_REDIRECTS=["https://app.yourdomain.com/auth/callback"]

docker compose up -d admin ai-agents
```

### 4.5 (Optional but recommended) nginx in front for path-routing

If you want a single domain serving the API on `/`, add a tiny nginx:

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

  # gRPC-web to admin (HTTP/1.1, fine for Cloudflare proxy)
  location / {
    proxy_pass http://admin:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;          # gRPC-web is streaming-shaped
    proxy_read_timeout 600s;
  }

  # ai-agents endpoints (chat/jd/interview) — same shape, different upstream
  location /agents/ {
    proxy_pass http://ai-agents:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 600s;
  }
}
EOF

docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d
```

Test:
```bash
curl -H "Host: api.yourdomain.com" http://localhost/public/jobs
# Should return the same JSON as direct :8080 hit
```

---

## Phase 5 — Build the frontend bundle locally (20 min)

You **don't** build on the ARM VM (ARM Node + Next.js minification is slow
and OOMs at 24GB with the wrong settings). Build on your laptop, push the
output. Cloudflare Pages will rebuild from GitHub on each push.

### 5.1 Point the FE at the public API

Create `frontend/apps/candidate/.env.production`:

```ini
NEXT_PUBLIC_ADMIN_URL=https://api.yourdomain.com
NEXT_PUBLIC_AI_AGENTS_URL=https://api.yourdomain.com/agents
NEXT_PUBLIC_MOCK=0
```

Commit + push.

### 5.2 Test the build locally first

```bash
cd frontend
npx pnpm@9.15.0 install
npx pnpm@9.15.0 --filter @ip/candidate build
# Should end with the route-size table — no errors.
```

---

## Phase 6 — Cloudflare Pages (15 min)

### 6.1 Connect repo

Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**:
- Select your GitHub repo
- **Branch:** `main`
- **Framework preset:** Next.js
- **Build command:** `cd frontend && npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @ip/candidate build`
- **Output directory:** `frontend/apps/candidate/.next`
- **Root directory:** *(leave blank — repo root)*
- **Environment variables (production):**
  - `NEXT_PUBLIC_ADMIN_URL=https://api.yourdomain.com`
  - `NEXT_PUBLIC_AI_AGENTS_URL=https://api.yourdomain.com/agents`
  - `NEXT_PUBLIC_MOCK=0`
  - `NODE_VERSION=20`

Click **Save and Deploy**. First build ~8 min.

### 6.2 Bind your subdomain

Pages project → **Custom domains → Set up a custom domain** → `app.yourdomain.com`.
Cloudflare auto-creates the CNAME in DNS.

Visit `https://app.yourdomain.com`. You should see the marketing landing.

---

## Phase 7 — End-to-end smoke test (10 min)

In order, on the live site:

1. **Marketing landing renders** at `/` (no console errors).
2. **Register a candidate** at `/register`.
3. **Dashboard shows** "Welcome back, <your-name>." (confirms email-in-JWT
   from commit `1f0f902` is live).
4. **Browse jobs** at `/jobs` — empty state is correct if no company seeded.
5. **Register a company** at `/company/register`.
6. **Visit `/company/branding`** — should show the empty editable form
   (NOT "Not found", confirms commit `43f6210`).
7. **Post a job** at `/company/jobs/new`. Save → publish.
8. **Sign back in as candidate**, see the role on `/jobs`, click → apply.
9. **Sign back in as company**, see the applicant on the job's applicants tab.

If any step fails, the issue is almost always:
- **CORS** → `CORS_ALLOW_ORIGIN` in `.env` doesn't include the live frontend origin → `docker compose up -d admin ai-agents` after fix.
- **`net::ERR_FAILED` on every RPC** → Cloudflare SSL mode is "Off" or wrong → set to Flexible.
- **`UNAVAILABLE`** → backend service down → `docker compose logs --tail=100 admin`.

---

## Phase 8 — Backups + secrets hygiene (15 min)

### 8.1 Daily Mongo backup → Cloudflare R2

R2 setup: Cloudflare → R2 → Create bucket `aptura-backups`. **Manage R2 API
Tokens** → create with Read/Write on that bucket. Save Access Key + Secret.

```bash
# Install rclone for R2
sudo apt install -y rclone

# Configure (interactive — pick s3 → other → r2 endpoint)
rclone config
# Endpoint: https://<your-account-id>.r2.cloudflarestorage.com
# Test:
rclone lsd r2:aptura-backups
```

Cron the dump:

```bash
sudo tee /etc/cron.daily/aptura-mongo-backup >/dev/null <<'EOF'
#!/bin/bash
set -e
STAMP=$(date -u +%Y-%m-%dT%H-%M)
DUMP=/tmp/mongo-$STAMP.archive.gz
docker exec interview-platform-mongo-1 mongodump --archive --gzip > "$DUMP"
rclone copyto "$DUMP" "r2:aptura-backups/mongo/$STAMP.archive.gz"
rm "$DUMP"
# Retention: keep 14 days
rclone delete --min-age 14d r2:aptura-backups/mongo
EOF
sudo chmod +x /etc/cron.daily/aptura-mongo-backup
```

R2 free tier: 10 GB storage, **zero egress**. 14 daily Mongo dumps × ~50 MB
each = well under cap.

### 8.2 Lock `.env` permissions

```bash
chmod 600 ~/ai-interview-platform/.env
# Never commit this file (already in .gitignore — verify with git status)
```

### 8.3 Auto-renew rotation reminder

Calendar item every 6 months:
- Rotate `JWT_SECRET` (forces all sessions to re-login)
- Regenerate Gemini API key
- Audit Oracle billing dashboard (should always read $0.00)

---

## Phase 9 — Operations runbook (ongoing)

### Update the live stack

```bash
cd ~/ai-interview-platform
git pull
docker compose build admin ai-agents mcp-data mcp-capability
docker compose up -d
# Cloudflare Pages auto-rebuilds the FE on the same push.
```

### Tail logs

```bash
docker compose logs -f --tail=100 admin ai-agents
docker compose logs --tail=50 mongo  # if you suspect data issues
```

### Restart a single service

```bash
docker compose restart admin
```

### Disk-fill emergency

```bash
df -h /  # boot volume usage
docker system prune -af --volumes  # nukes unused images + volumes
# (Mongo/Redis data lives in NAMED volumes, NOT affected by prune.)
```

### Memory ceiling check

Idle stack uses ~1.2 GB on 24 GB VM. If `docker stats` shows total >18 GB
under steady load, something is leaking — first suspect is the LangGraph
agent in ai-agents accumulating session state. Restart with
`docker compose restart ai-agents`.

---

## Phase 10 (later) — Voice interview path

Skip this for the first deploy. When you're ready:

### 10.1 Open UDP ports

Oracle VCN security list → add ingress rules:

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

### 10.2 Bring up voice services

```bash
nano .env
# Fill:
LIVEKIT_URL=wss://api.yourdomain.com:7880
LIVEKIT_API_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')
LIVEKIT_API_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
GROQ_API_KEY=<from console.groq.com>

# Enable the voice profile
docker compose --profile voice up -d
```

### 10.3 LiveKit Cloud as an alternative

If self-hosted LiveKit gives you NAT/firewall pain (likely behind
Cloudflare's proxy — orange-cloud breaks WebRTC), use **LiveKit Cloud**
free tier instead. Replace `LIVEKIT_URL/KEY/SECRET` with the values from
their dashboard. Free tier = 50 connection-minutes per month — fine for
demo, not for a real cohort.

In that case, **turn off the orange cloud on `api.yourdomain.com`** for
the WebRTC ports, or use a separate `voice.yourdomain.com` DNS-only
record pointing at the VM.

---

## Rollback / disaster recovery

### Rollback a bad release

```bash
cd ~/ai-interview-platform
git log --oneline -10           # find the last good SHA
git checkout <good-sha>
docker compose build admin ai-agents mcp-data mcp-capability
docker compose up -d
```

Cloudflare Pages: project → Deployments → previous deploy → **Rollback to this deployment**.

### VM is dead / Oracle reclaimed

1. Provision new VM (Phase 1 — 30 min).
2. Re-run Phases 2 + 3.
3. Restore latest Mongo dump:
   ```bash
   STAMP=2026-06-20T03-00  # whichever
   rclone copyto r2:aptura-backups/mongo/$STAMP.archive.gz /tmp/restore.gz
   docker exec -i interview-platform-mongo-1 mongorestore --archive --gzip --drop < /tmp/restore.gz
   ```
4. Update Cloudflare DNS `api.yourdomain.com` → new VM IP (1-line edit, DNS propagates in ~1 min through Cloudflare).
5. **Recovery time: ~45 min** with backups in hand.

### Cloudflare Pages build fails

99% of the time the cause is missing `NODE_VERSION=20` env var → the runner
defaults to Node 18 which can't build Next 15. Set it and retry.

---

## Troubleshooting cheat sheet

| Symptom | Likely cause | Quick fix |
|---|---|---|
| `/public/jobs` 500s | aggregate-cursor regression | already fixed in `e9d411b`; if returns: `docker compose logs admin --tail=200 \| grep AttributeError` |
| `CORS error` on every RPC | `CORS_ALLOW_ORIGIN` doesn't match the FE origin (must include scheme) | edit `.env`, `docker compose up -d admin ai-agents` |
| `Welcome back, <ObjectId>` | running old image without commit `1f0f902` | `git pull && docker compose build admin && docker compose up -d admin` |
| `/company/branding` says "Not found" | running old FE before commit `43f6210` | redeploy via Cloudflare Pages |
| Mongo OOM in container | mongod has no `--wiredTigerCacheSizeGB` cap → grabs >50% RAM | add `command: --wiredTigerCacheSizeGB 1` to mongo service in compose |
| ai-agents not consuming from rabbit | RabbitMQ container restarted but ai-agents didn't reconnect | `docker compose restart ai-agents` |
| Oracle "out of capacity" creating ARM VM | regional capacity exhausted | retry every 30 min; or pick another home region during signup |

---

## Costs over time — when to start paying

| Trigger | Recommended upgrade | $/mo |
|---|---|---|
| > 50 active companies | Atlas M10 dedicated Mongo | ~$60 |
| > 100 concurrent interviews | Move LLM off Gemini free → Gemini Pay-as-you-go | ~$0.30/interview |
| > 1000 daily registrations | SES + paid SMTP (Brevo Starter) | ~$20 |
| HIPAA / SOC2 requirement | Move off Oracle Always Free → AWS/GCP/dedicated | ~$200 baseline |
| Real voice interviews at scale | LiveKit Cloud paid tier | $0.005/connection-minute |

For a portfolio / demo / first-100-users phase, **$0 is genuinely
sustainable**. The architecture (event-driven microservices, stateless
HTTP layer, swappable infra via env) lets you upgrade piecewise without
rewrites — exactly what the [DEPLOYMENT.md](./DEPLOYMENT.md) "Honest limits"
section promises.

---

## Appendix — Files this plan touches

Existing:
- [docker-compose.yml](../../../docker-compose.yml) — the stack
- [.env.example](../../../.env.example) — copy to `.env`, fill in
- [docker/Dockerfile](../../../docker/Dockerfile) — shared image
- [frontend/apps/candidate/package.json](../../../frontend/apps/candidate/package.json) — Next.js build

New (created during the deploy):
- `.env` (on VM, gitignored)
- `docker-compose.override.yml` (on VM, gates voice services)
- `docker-compose.nginx.yml` + `nginx.conf` (on VM, public path-router)
- `/etc/cron.daily/aptura-mongo-backup` (on VM)
- `/etc/cron.hourly/aptura-heartbeat` (on VM)
- `frontend/apps/candidate/.env.production` (in repo, committed)
- Cloudflare Pages project (cloud-side config)
- Cloudflare DNS records (cloud-side config)
- R2 bucket `aptura-backups` (cloud-side)
