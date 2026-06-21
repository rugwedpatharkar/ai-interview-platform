# Interview completed — Backend contract (v3 · frozen)

> **Screen.** `/interview/[applicationId]/done` — the candidate's post-interview last-touch
> surface (clean exit + auto-terminated variants). **FE consumer:**
> [`frontend_interview-completed.md`](./frontend_interview-completed.md).
> **Status:** `EXISTING — reuse the interview gRPC + the HIGH-severity auto-gate.` Restated from
> [`../proctored-interview/backend_proctored-interview.md`](../proctored-interview/backend_proctored-interview.md)
> §A. **No proto delta, no new collection, no new event type.** The completed page is read-only
> — it consumes the application's current `state` from the dashboard's existing
> `["applications"]` cache and (when present) the live room's captured `ProctorAck.reason`
> from session storage. No new RPC; no new RPC call from this page at all.
> **Anti-fiction reminder:** Aptura is pre-launch. The completed page renders only what the
> server actually said: the application's current `state` (per `listMyApplications`) and (for
> the auto-terminated variant) the verbatim `terminatedReason` the live room captured from
> `ProctorAck`. ETA values use truthful framing ("a few minutes" fallback when no
> `scoreEtaMinutes` is available); decision-timing language is a range, not a promise; no
> fabricated outcome language ("you did great!" / "you nailed it") appears anywhere. See the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** `ApplicationService` is **real**; the dashboard's
> `["applications"]` cache is the source of the title + current state. The
> `terminatedReason` capture from the live room's `ProctorAck` is a small client-side
> bridge (session storage) — no backend change.

## Strict-proctored invariants — what the backend enforces (restated)

- **One strictly proctored AI interview per role; no second takes.** The completed page
  honors this by being read-only — there is no "retry" / "request another attempt" mutation,
  and no RPC the page could call to re-mint an `rtcToken` for a terminated application.
  Server-side, `rtcToken` returns `FAILED_PRECONDITION` for an application in any post-
  interview terminal state (`interviewed` / `scored` / `proctor_terminated`) — see the
  proctored-interview contract.
- **Server-authoritative auto-end.** The `terminated: true` / `reason` ack from
  `recordProctorEvents` is the **single source** of the auto-terminated variant; the FE never
  fabricates that signal. The page reads the captured `terminatedReason` defensively (when
  the live room handed it off via session storage); when absent, the page omits the
  `<blockquote>` rather than inventing a reason.
- **HIGH_SEVERITY list is unchanged.** This page is read-only; it doesn't interact with the
  severity catalog.

## Functionalities (what the backend provides for this page)

- **List** the caller's applications — the completed page reads the current `state` from the
  dashboard's existing `["applications"]` cache to detect the variant (clean exit vs.
  auto-terminated) and to render the title.
- **(Indirect)** the live room's `recordProctorEvents` ack — the `reason` field is captured
  by the live room into session storage before the room navigates here; the completed page
  reads it on mount and clears it after render.
- **No mutations from this page.** No RPC is called by this page directly.

## Service & RPCs (read-only; the page calls nothing directly)

| Function | RPC | Auth/scope |
|---|---|---|
| List my applications (read from cache) | `api.applications.listMyApplications({})` (cached by the dashboard) | bearer, candidate; own only |

> **No new RPC.** The completed page does not call any RPC directly. It reads the
> dashboard's cached `["applications"]` to find the current state and title, and (for the
> auto-terminated variant) reads the captured `ProctorAck.reason` from session storage that
> the live room placed there before navigating here.

## Request / Response structures (preserved verbatim — read-only consumption)

```ts
// applications.listMyApplications({}) → (cached by the dashboard; not re-fetched on this page)
interface Application {
  applicationId: string;
  jobId: string;
  state: string;                          // funnel vocabulary; post-interview terminal states:
                                          //   "interviewed"             — clean exit, awaiting score
                                          //   "scored"                  — score ready, awaiting decision
                                          //   "shortlisted"             — advanced
                                          //   "hired"                   — terminal advance
                                          //   "rejected"                — terminal decline
                                          //   "proctor_terminated"      — auto-terminated (sentinel for Variant B)
                                          //   "withdrawn"               — candidate withdrew (redirect, not done)
  jobTitle?: string;                      // optional EXTEND — render-if-present
  companyName?: string;                   // optional EXTEND — render-if-present
}

// ProctorAck.reason — captured by the live room from a terminal recordProctorEvents ack;
// stored in sessionStorage under "interview:lastTerminatedReason:" + applicationId;
// read by the completed page on mount; cleared after render.
//   shape: string (server's free-text reason; empty string when not auto-terminated)

// scoreEtaMinutes — optional EXTEND on the application or report projection (render-if-present).
//   When absent, the FE falls back to a truthful "a few minutes" string. Adding this field
//   later is non-breaking; the FE renders it interpolated when present.
```

- **FE mock shape:** none new — the page reads from the dashboard's existing cached
  `Application[]` and from `sessionStorage`. No new mock client.

## Data required

- **Read:** the dashboard's cached `Application[]` (caller-scoped; same fields the dashboard
  reads, no new field is required for the basic operation of this page — `state` + the
  optional `jobTitle` / `companyName` are enough). The optional `scoreEtaMinutes` is
  render-if-present; absent → "a few minutes" fallback.
- **Read:** `sessionStorage["interview:lastTerminatedReason:" + applicationId]` (client-side
  bridge from the live room; cleared after render).
- **Write:** **none.** The page is read-only — no mutations, no events emitted.
- **Indexes:** none new (the page reads from the existing dashboard cache; no fresh fetch).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED` on the dashboard's listing (the
  completed page surfaces a generic "Please sign in again" via the existing auth guard);
  non-candidate role → `PERMISSION_DENIED`.
- **Application not in cache (deep link from email)** → the title falls back to "Loading…"
  → `Job {jobId}` when the dashboard's poll hydrates the cache. The page does NOT issue a
  separate fetch; it lets the dashboard's existing query own the data. (If a faster hydration
  is needed later, the page can call `useQuery(["applications"])` itself — same key, same
  poll gate; not required today.)
- **`withdrawn` state** → defensive redirect to `/applications/[applicationId]` before
  render — the candidate withdrew, not a clean exit.
- **Auto-terminated variant without a `reason`** (deep link, session storage empty) → the
  `<blockquote>` is omitted; the body paragraph stands alone. No fabricated reason.
- **`scoreEtaMinutes` absent** → "a few minutes" fallback in body + "A few minutes" in the
  stat.
- **No retry path** — there is no RPC on this page; the live room's `rtcToken` would
  `FAILED_PRECONDITION` on a terminated application anyway (server-enforced). The page
  intentionally has no "retry" CTA.
- **Contact-support CTA** (auto-terminated variant) — opens a support modal that composes
  a `mailto:` link today; when the support-form mutation lands (deferred), the modal will
  post a typed support request through the messaging seam (no new RPC needed; the existing
  `messaging.postMessage` with a `tag: "support_request"` is sufficient).

## Cross-references

- Shared contract: [`../proctored-interview/backend_proctored-interview.md`](../proctored-interview/backend_proctored-interview.md)
  §A (the `ProctorAck.terminated` / `reason` ack that drives Variant B; the
  server-authoritative auto-gate; the "no second take" enforcement at `rtcToken`).
- Sibling: [`../interview-lobby/backend_interview-lobby.md`](../interview-lobby/backend_interview-lobby.md)
  — the pre-interview gate; same shell-free family, same `.cell` vocabulary, same
  strict-proctored invariants.
- Sibling: [`../candidate-dashboard/backend_candidate-dashboard.md`](../candidate-dashboard/backend_candidate-dashboard.md)
  — the cache the completed page reads from; the new `state` lands on the dashboard's next
  poll cycle.
- Sibling: [`../application-detail/backend_application-detail.md`](../application-detail/backend_application-detail.md)
  — the "Open application tracker" CTA target (Variant A); the tracker's timeline shows
  the new `interviewed` / `interview_auto_terminated` event in the optional `history` blob
  when the backend lands it.
- Sibling: [`../application-outcome/backend_application-outcome.md`](../application-outcome/backend_application-outcome.md)
  — once the report scores and `state` advances to `scored`, the outcome page becomes the
  candidate's next read; the completed page does NOT link there directly (it links to the
  tracker, which the candidate can follow to the outcome once available).
- Shared enum: `ApplicationState` (the post-interview terminal states above);
  `ProctoringEventType` (HIGH set — the live room's terminal ack drives Variant B; this
  page doesn't interact with the set directly).
- Design language: [`../_design-language.md`](../_design-language.md) — see the
  strict-proctored item under "Mandatory revamp rule" and the `.cell` ended-state
  vocabulary inherited from the proctored-interview plan.
