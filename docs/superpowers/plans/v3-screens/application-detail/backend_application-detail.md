# Application detail — Backend contract (v3 · frozen)

> **Screen.** `/applications/[id]` — per-application detail (status, timeline, scheduled events,
> messages preview, tabs). **FE consumer:** [`frontend_application-detail.md`](./frontend_application-detail.md).
> **Status:** `EXISTING — reuse v2` · **no proto delta, no new RPC, no new collection, no new
> event.** The detail page consumes the same `applications.listMyApplications` query the
> dashboard already runs (client-side filter on `applicationId`) + the existing messaging seam.
> **Anti-fiction reminder:** Aptura is pre-launch. Empty / fallback states must use truthful
> copy ("Job {jobId}" fallback when `jobTitle` is absent; "Employer" fallback when `companyName`
> is absent) — never fabricated company names. Sample timeline rows are labelled per the actual
> `state` + `history` from the server; if `history` is empty, the timeline derives only the
> currently-active step and renders prior steps as "—" timestamps, never invented dates. See
> the anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** `ApplicationService` + `MessagingService` are **real** (built; gRPC-web
> over `admin`). The detail page codes against the same shapes; nothing new to mock.

## Functionalities (what the backend provides for this page)

- **List** the caller's applications — the detail page filters this array client-side by
  `applicationId` (same query, same key as the dashboard).
- **List** the messages thread for the application (preview cell + tabs panel).
- **(Optional render-if-present)** carry per-application history events on each `Application`
  so the timeline can fill in completed-step timestamps + scheduled events without a separate
  fetch.

## Service & RPCs (gRPC-web; `admin`, candidate-scoped — subject from bearer token)

| Function | RPC | Auth/scope |
|---|---|---|
| List my applications | `api.applications.listMyApplications({})` → `{ applications: Application[] }` | bearer, candidate; own only |
| List messages for an application | `api.messaging.listMessages({ applicationId, limit: 50 })` → `{ messages: Message[] }` | bearer, candidate; own only (server enforces caller is a participant) |

> **No new RPC.** The timeline rows are a pure function of the existing `Application` shape
> (current `state` + the optional `history?: ApplicationEvent[]` blob); the messages preview
> reuses the existing `messaging.listMessages` already used by the standalone
> `/messages/{applicationId}` page.

## Request / Response structures (camelCase per protobuf-es on the FE)

```ts
// applications.listMyApplications({}) →
interface Application {
  applicationId: string;
  jobId: string;
  state: string;                          // funnel vocabulary (same enum the dashboard uses)
  jobTitle?: string;                      // optional EXTEND — render-if-present
  companyName?: string;                   // optional EXTEND — render-if-present
  appliedAt?: string;                     // ISO timestamp (optional — FE falls back to "—" when absent)
  history?: ApplicationEvent[];           // optional EXTEND — render-if-present
}
interface ApplicationEvent {
  type:                                   // funnel transitions + scheduled events
    | "applied"
    | "aptitude_scheduled"
    | "aptitude_completed"
    | "aptitude_gated"
    | "interview_scheduled"
    | "interview_started"
    | "interview_completed"
    | "interview_auto_terminated"
    | "scored"
    | "advanced"
    | "shortlisted"
    | "rejected"
    | "withdrawn";
  at: string;                             // ISO timestamp
  meta?: { [k: string]: string };         // map; scalar values only (no media bytes)
}
interface ListMyApplicationsResponse { applications: Application[] }

// messaging.listMessages({ applicationId: string, limit: number }) →
interface Message {
  messageId: string;
  applicationId: string;
  senderId: string;
  senderName?: string;                    // optional — FE falls back to senderRole
  senderRole: "candidate" | "recruiter" | "system";
  body: string;
  sentAt: string;                         // ISO timestamp
}
interface ListMessagesResponse { messages: Message[] }
```

- **FE mock shape:** none new — binds to the **existing** `api.applications.*` /
  `api.messaging.*`. The detail page codes against the same shapes the dashboard +
  message-thread pages already use.
- **`history` is render-if-present.** When absent, the FE derives the timeline by:
  1. Setting the active step from `state` (using the same `funnelStage` mapping the dashboard
     uses).
  2. Stamping the "Applied" row's timestamp from `appliedAt` when present, else "—".
  3. Showing "—" for completed-step timestamps that aren't carried.
  4. Pulling scheduled-event rows for the c2 cell only when `history` includes the relevant
     `_scheduled` events; otherwise the c2 cell renders its empty branch.
  When the backend lands `history`, the timeline + events cell light up automatically — no FE
  change required.

## Data required

- **Read:** the applications collection (caller-scoped: same fields the dashboard reads, plus
  the optional `history` blob when present); the messages collection filtered by
  `applicationId` (caller is a participant).
- **Derived (FE, no backend):** the active timeline step (`funnelStage(state)`), the
  "Days since applied" KPI (`(now - appliedAt) / 86400`), the "Next step" label (lookup table
  over `state`), the latest-3 messages for the preview cell, the empty branches.
- **Indexes:** none new (existing application/messaging indexes suffice).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role →
  `PERMISSION_DENIED`.
- **Not in the caller's tracker** (`applicationId` filter returns nothing) → FE renders the
  in-cell "This application isn't in your tracker." empty state + a "Back to applications"
  link. The server already enforces `listMyApplications` to be caller-scoped, so any
  `applicationId` that isn't in the result genuinely isn't the caller's.
- **No messages yet** → `listMessages` returns `{ messages: [] }`; the c1 preview + tabs
  Messages render their empty branches.
- **No history blob** → the timeline renders the active step with prior rows showing "—"
  timestamps; the c2 events cell renders its empty branch.
- **`UNAVAILABLE` / transport error** → the anchor cell falls back to `ErrorState` + retry;
  the sidebar cells render their "couldn't load right now" empty branches; the page does NOT
  dead-end (the candidate can still navigate back).
- **Withdraw etc.** — the detail page does NOT own write mutations. The dashboard's existing
  withdraw confirm flow is the only path; once `state` transitions to `withdrawn`, the
  detail page's timeline renders the terminal row + stops the active-step pulse.
- **10s poll** is shared with the dashboard (`["applications"]` key, same conditional gate);
  the detail page reads the same cache entry, so any state transition updates this page
  without a separate fetch.

## Cross-references

- Restates: v2 `applications.md` (the application tracker contract) + `messaging.md` (the
  thread reader contract) — same shapes, same keys.
- Shared service: `ApplicationService` (`listMyApplications`) — also consumed by
  [`../candidate-dashboard/backend_candidate-dashboard.md`](../candidate-dashboard/backend_candidate-dashboard.md).
- Shared service: `MessagingService` (`listMessages`) — also consumed by
  [`../message-thread/backend_message-thread.md`](../message-thread/backend_message-thread.md)
  (the full thread page).
- Sibling screen: [`../application-outcome/backend_application-outcome.md`](../application-outcome/backend_application-outcome.md)
  — the outcome page consumes `Report.GetReport` in the candidate read scope.
- Shared enum: `ApplicationState` (the funnel `state` vocabulary) + `ApplicationEvent.type`
  (the optional `history` blob's event types).
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo:
  [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
