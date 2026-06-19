# FRONTEND

> Two web apps — a **Company app** and a **Candidate app** — in one monorepo with
> shared UI + API-client packages. Talks to the admin-service over REST + WebSocket.
> See `ARCHITECTURE.md` and `ADMIN_SERVICE.md`.

## 1. Technologies

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR for public job pages/SEO, file routing, mature ecosystem |
| Styling/UI | **Tailwind CSS + shadcn/ui** | Fast, consistent, accessible components; shared design system |
| Server state | **TanStack Query** | Caching, mutations, background refetch against the REST API |
| Forms | **react-hook-form + zod** | Typed validation mirroring backend Pydantic schemas |
| Realtime | **native WebSocket** client | Interview + chat streaming; LiveKit client added P3/P4 |
| Monorepo | **pnpm + Turborepo** | Two apps + shared packages, fast incremental builds |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Component + full-flow coverage |

## 2. Architecture

```
frontend/
  apps/
    company/        # Next.js app — recruiter/company persona
      app/          # routes: /jobs, /jobs/[id]/funnel, /candidates/[id], /settings
    candidate/      # Next.js app — candidate persona
      app/          # routes: /jobs, /applications, /profile, /interview/[id]
  packages/
    ui/             # shared shadcn/ui components, theme, layout primitives
    api-client/     # typed client generated from admin-service OpenAPI
    ws/             # WebSocket hooks (interview, chat, notifications)
    config/         # eslint/tsconfig/tailwind presets
```

- **Two apps, shared packages** → clean separation of two very different UXs,
  independent deploys, zero duplication of the API client/design system.
- **Auth:** JWT obtained from admin-service; attached as bearer on API + WS.
  (Token storage approach finalized at P1 build — httpOnly cookie preferred.)
- **Role routing:** each app assumes its persona; the API enforces the real
  authorization (FE role checks are UX only).

## 3. Functionalities (by epic / phase)

### Company app
| Functionality | Epic | Phase |
|---|---|---|
| Register/verify, login, company profile, **team invites + roles** | A,B | P1 |
| Create/edit job, **screening config** (aptitude topics/threshold, rubric, time budget), publish/pause/close | B,E | P1 |
| **Funnel board** (applied→aptitude→interviewed→scored) | B,D | P1 |
| Candidate results, **compare side-by-side**, notes/ratings, **decision actions** | B,G | P1 |
| **Excel download** per job | G | P1 |
| Gate **override** UI | E | P1 |
| Recruiter **chat assistant** (applicants-only), funnel analytics, talent pool | L,H | P2/3 |

### Candidate app
| Functionality | Epic | Phase |
|---|---|---|
| Register/verify, login | A | P1 |
| **Resume upload + profile review/edit**, completeness meter | C | P1 |
| Browse/filter jobs, **apply + consent** | C | P1 |
| **MCQ aptitude** (timed, single attempt) | E | P1 |
| **Live interview UI** (text; pause/resume; reconnect) | F | P1 |
| **Application tracker** (status timeline) + notifications | C | P1 |
| AI **recommendations**, **chat assistant** (feedback/skill-gap, matching) | H,L | P2/3 |
| Voice/video interview UI | F | P3/P4 |

## 4. Interfaces / Connections

### Consumes (admin-service)
- **REST `/api/v1`** via `packages/api-client` (typed from OpenAPI): auth, jobs,
  profiles, applications, aptitude, results/export, decisions, notifications.
- **WebSocket** `WS /interview/ws` (interview turns; streaming) and chat WS (P2/3).
- Auth: JWT bearer on every request/connection.

### Contracts
- Request/response shapes mirror admin-service Pydantic models; `zod` schemas in
  `api-client` validate at the boundary and feed `react-hook-form`.

### Does NOT
- Talk to ai-agents, MCP servers, Mongo, or RabbitMQ directly — only the
  admin-service. (The admin-service is the single front door.)

## 5. Phasing
- **P1:** both apps, text interview UI, full funnel + decision loop UX; accessible
  components (WCAG) from the start.
- **P2:** recommendations surfaces, chat assistant UI (streaming), analytics
  dashboards, SSO login.
- **P3/P4:** LiveKit client for voice then video; device/permission pre-check screen;
  recording playback (company side).
- **P5:** proctoring UX (consent, in-interview signals), i18n/multilingual.

## 6. Conventions
- Server state in TanStack Query (no ad-hoc fetch-in-component); forms via
  react-hook-form + zod.
- Shared components live in `packages/ui`; never duplicate across apps.
- All API types come from `packages/api-client` (generated) — single source.
- FE authorization is UX-only; the admin-service is the security authority.
