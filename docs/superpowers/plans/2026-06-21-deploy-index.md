# Deploy index — which $0 shape should you pick?

Three deployment shapes exist for Aptura. They all add up to **$0/month** (minus a
domain, ~$10/yr). The right pick depends on **(a)** whether the product is
commercial today, **(b)** how much "babysit 5 dashboards" pain you accept, and
**(c)** whether you ever want to leave the free tier without a rewrite.

## TL;DR table

| Shape | Backend lives on | Mongo / Redis / Rabbit | Frontend on | Monthly $$ | Ops burden | Recommendation |
|---|---|---|---|---|---|---|
| **A — Self-hosted** | 1 Oracle ARM VM (12 GB / 2 OCPU) | self-hosted in docker-compose on the VM | Cloudflare Pages | **$0** | one VM, one SSH | **Start here.** |
| **B — Managed hybrid** | 1 Oracle ARM VM (4 GB enough) | Atlas M0 + Upstash + CloudAMQP + R2 | Cloudflare Pages | **$0** | 5 dashboards + 5 quota caps to watch | When you'd rather not run databases |
| **C — Vercel frontend** | same as A or B | same as A or B | Vercel Hobby | **$0** (non-commercial only) | same as A/B + Vercel quota | **Don't pick if the product is commercial** — Vercel Hobby forbids commercial use. Use Cloudflare Pages instead. |

The detailed runbooks:
- **Shape A:** [2026-06-21-deploy-shape-a-self-hosted.md](./2026-06-21-deploy-shape-a-self-hosted.md)
- **Shape B:** [2026-06-21-deploy-shape-b-managed-hybrid.md](./2026-06-21-deploy-shape-b-managed-hybrid.md)

## What stays the same across all three shapes

| Component | Provider | Free tier (verified 2026) | Why this provider |
|---|---|---|---|
| **Frontend** | Cloudflare Pages (preferred) | 500 builds/mo, unlimited bandwidth, free SSL, global CDN, 1 concurrent build | Only free FE host with **commercial use allowed** AND unlimited bandwidth. Vercel Hobby caps at 100 GB and forbids commercial. |
| **DNS + edge SSL** | Cloudflare DNS | Unlimited records, proxied SSL termination | Required for the rest — free DNS + free SSL on a real domain. |
| **LLM** | Google AI Studio (Gemini Flash) | 1,500 req/day · 10 RPM · 250k TPM (2.5 Flash) | Already wired in `ai-agents` via `GEMINI_API_KEY`. Pro tier is paid since May 2026; Flash is enough for our prompts. |
| **Object storage** | Cloudflare R2 | 10 GB storage · 1 M Class-A ops · 10 M Class-B ops · **zero egress** | S3-compatible drop-in for our `lib.storage.ObjectStorage`. Zero egress = backups + asset serving don't bleed quota. |
| **Email (verify, reset)** | Resend (preferred) OR Brevo | Resend: 3,000/mo · Brevo: 300/day shared with marketing | Resend's monthly model fits demo bursts better than Brevo's daily cap. |
| **STT** (voice only) | Groq Whisper | 2,000 req/day · 7,200 audio-sec/hour | Already wired via `GROQ_API_KEY`. Skip if voice deferred. |
| **Voice signaling** (voice only) | LiveKit Cloud Build plan | 5,000 WebRTC-min/mo · 1,000 agent-min/mo · 100 concurrent | OR self-host LiveKit container. Self-host hits NAT/firewall pain behind Cloudflare proxy; LiveKit Cloud is the easy path. |

## What differs

### Backend compute

- **Shape A** runs the full `docker compose up` on **one** Oracle ARM Always Free VM. Mongo, Redis, RabbitMQ, MinIO, Qdrant — all containers, all on the box. Total idle footprint: **~1.2 GB RAM, ~5 % of 1 core**. Fits the new 12 GB cap with 10× headroom.
- **Shape B** also uses an Oracle ARM VM but only for the 4 Python services. Data plane lives in managed-free providers (Atlas M0 / Upstash / CloudAMQP / R2). Smaller VM possible — even a 4 GB instance works.

### What you operate vs what you call

| Layer | Shape A | Shape B |
|---|---|---|
| MongoDB | `docker compose up mongo` | Atlas M0 (512 MB, **no backups**, 1 cluster cap) |
| Redis | `docker compose up redis` | Upstash (256 MB, 500 k commands/mo) |
| RabbitMQ | `docker compose up rabbitmq` | CloudAMQP Little Lemur (100 connections, monthly message cap) |
| Storage | `docker compose up minio` OR R2 | R2 (10 GB, zero egress) |
| Vector DB | `docker compose up qdrant` | Qdrant Cloud free (1 GB cluster) — or skip RAG features |

### When each shape stops being free

| Hits the wall at... | Shape A | Shape B |
|---|---|---|
| Data volume | When Mongo > VM disk (default 47 GB on Oracle) | Atlas M0 at 512 MB → upgrade to M10 (~$60/mo) |
| Concurrent users | When 12 GB RAM saturated (1000s of sessions) | Mongo M0's 500 conn cap (~50 active users) |
| LLM throughput | Gemini Flash 1,500 RPD (~60 candidate sessions/day) | same |
| Mongo backups | When you write your own cron (already in plan) | Atlas M0 has **no backup option** → you must export to R2 manually |

## The honest pick

**Most people: Shape A.** One VM is genuinely less work than five dashboards.
The 1.2 GB idle / 12 GB available math is honest — there's room for real
traffic before anything caps. You write a one-line Mongo backup cron and
move on.

**Pick Shape B only if:** you've been burned by self-managing Mongo
before, or your team has a "don't run databases" rule, or you want to
demonstrate cloud-managed infra on your resume. The trade is real: Atlas
M0's 500-connection cap will hurt before any other limit does, and
CloudAMQP's message cap is undocumented (you find it when they email you).

**Don't pick Vercel Hobby for any commercial product.** ToS says
non-commercial use only; the moment Aptura takes a paying customer they
can suspend the project. Cloudflare Pages has no such restriction and
gives you unlimited bandwidth on top.

## Quick reality check (verified 2026 caps)

| Provider | What changed since 2025 |
|---|---|
| **Oracle Always Free ARM** | **Downgraded June 15, 2026** from 4 OCPU/24 GB to **2 OCPU/12 GB**. Existing instances above the new cap get shut down. Still enough for us. |
| **Fly.io free tier** | **Killed in 2024.** No more 3× 256 MB free machines. Trial is now $5 credit / 7 days / 2 VM-hours — not viable for always-on. |
| **Render free web services** | Still sleep after 15 min idle. Still no free background-worker tier. **Wrong shape for our consumer + SSE.** |
| **Railway** | Free trial only ($5 credit). Then ~$15/mo minimum. |
| **MongoDB Atlas M0** | Unchanged: 512 MB, 500 connections, no backups, 1 cluster/project. |
| **Upstash Redis free** | Switched from **10 k/day** to **500 k/month** (~16 k/day average) in March 2025. Slight net loss. |
| **Cloudflare R2 free** | Unchanged: 10 GB, 1 M / 10 M ops, zero egress. Still excellent. |
| **Cloudflare Pages free** | Unchanged: 500 builds/mo, unlimited bandwidth, 1 concurrent build. |
| **Vercel Hobby** | Unchanged: 100 GB bandwidth, 1 M edge requests, **non-commercial only**. |
| **Gemini Pro free** | **Removed May 2026.** Only Flash and Flash-Lite remain on free. Our `ai-agents` should target `gemini-2.5-flash` or `gemini-3.1-flash-lite`, not Pro. |

## Next step

Open one of:
- **[Shape A runbook](./2026-06-21-deploy-shape-a-self-hosted.md)** — recommended path, ~3 hours to live.
- **[Shape B runbook](./2026-06-21-deploy-shape-b-managed-hybrid.md)** — managed-hybrid path, ~4 hours to live (more dashboards).

Sources for the verified 2026 caps:
- [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle Always Free Limits 2026 — capacity reality](https://space-node.net/blog/oracle-cloud-always-free-limits-2026)
- [Fly.io Pricing](https://fly.io/pricing/) — no permanent free tier
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) — non-commercial clause
- [Cloudflare Workers & Pages Pricing](https://www.cloudflare.com/plans/developer-platform/)
- [Atlas Free Cluster Limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [Upstash Redis Pricing](https://upstash.com/pricing/redis)
- [CloudAMQP Plans](https://www.cloudamqp.com/plans.html)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [LiveKit Quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- [Brevo Free Plan FAQ](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
