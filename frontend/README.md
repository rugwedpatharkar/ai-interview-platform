# Frontend — Interview Platform

pnpm + Turborepo monorepo: two Next.js (App Router, React 19) apps over a typed gRPC-web
client, talking to the `admin` service. See `../docs/superpowers/plans/DEPLOYMENT.md` for the
backend/transport rationale.

## Structure
- **`packages/api-client`** — typed gRPC-web client, generated from admin's `.proto`
  (`pnpm --filter @ip/api-client gen`). Single source of truth for the API contract.
- **`packages/shared`** — cross-app React glue: refresh-token transport, `ConnectError`→message
  mapping, QueryClient + `refetchUntil` polling, auth factory (`makeAuth`), role guards, the
  ai-agents interview REST client, `downloadBytes`.
- **`packages/ui`** — design system: hand-rolled primitives (Button/Input/Card/Badge/…) +
  Radix-backed interactive components (Select/Dialog/Tabs/RadioGroup/Checkbox) + `sonner` toasts
  + status tokens + layout primitives + Table.
- **`apps/candidate`** (:3000) — register → verify → profile + resume (AI-parsed review) → apply →
  aptitude → live interview → tracker → account/erasure.
  Recruiter-side routes live under `/company/...` in this same app — jobs (create/publish) →
  applicants → AI report → decide / gate-override → xlsx export → team invites.

## Run (dev)
Backend must be running (`admin` :8080 gRPC-web, `ai-agents` :8081 interview REST) — see
`../docker/README.md` (`docker compose up`).
```bash
npx pnpm@9.15.0 install
npx pnpm@9.15.0 --filter @ip/candidate dev   # http://localhost:3000
```
Env (optional): `NEXT_PUBLIC_ADMIN_URL` (default `http://localhost:8080`),
`NEXT_PUBLIC_AIAGENTS_URL` (default `http://localhost:8081`).

## Regenerate the API client (after a backend proto change)
```bash
npx pnpm@9.15.0 --filter @ip/api-client gen
```

## Build / typecheck
```bash
npx pnpm@9.15.0 --filter @ip/candidate build
npx pnpm@9.15.0 --filter @ip/ui --filter @ip/shared --filter @ip/api-client typecheck
```

## Notes
- No global `pnpm`/`buf`/`tsx` — use `npx`. Node ≥ 20.
- TS workspace packages ship source; Next compiles them (`transpilePackages` + a webpack
  `resolve.extensionAlias` mapping `.js`→`.ts`/`.tsx`).
- Tailwind v4 (`@import "tailwindcss"` + `@source "../../../packages/ui/src"`).

## Security notes
- **Token storage tradeoff.** Access + refresh tokens are kept in `localStorage`
  (namespaced per app). This is convenient but means any XSS can read them — so the
  refresh token's blast radius is a durable session, not just an access window.
  Mitigations in place: refresh-token **rotation + reuse-detection** (server-side), a
  **shortened refresh TTL** (7 days), and a strict **Content-Security-Policy** on both
  apps (`next.config.ts`) to narrow the XSS surface. **Follow-up:** move the refresh
  token to an httpOnly+Secure+SameSite cookie set by `admin`'s Refresh RPC, and replace
  the CSP `script-src 'unsafe-inline'` with per-request nonces.

## End-to-end verification
Full funnel E2E needs the whole stack (`admin` + `ai-agents` + Mongo/Redis/RabbitMQ via
`../docker-compose.yml`). With it up:
- **Candidate:** register → upload resume (parses async) → apply (job ID from a company) →
  aptitude → interview.
- **Company:** register → create + publish a job → see the applicant → (after the interview)
  open the report → decide → export the xlsx.

The gRPC-web transport is independently proven, no stack required:
```bash
python ../scripts/smoke_login.py --serve &       # admin gRPC-web on :8099 (in-memory fakes)
ADMIN_URL=http://127.0.0.1:8099 npx tsx packages/api-client/smoke.ts
```
