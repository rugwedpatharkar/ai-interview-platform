---
from: QA
to:   MGR
priority: High
state: open
opened: 2026-07-29 12:00 UTC
---

## What

Six bugs sit at `state=filed` in [qa/bugs.md](../qa/bugs.md) and need triage
so the FE and BE sessions can pick them up on their next iteration. This
handoff is the roll-up: severity, blast radius, and a suggested owner for
each. QA does not write `assignee` — the picks below are recommendations
for you to accept or reject when you move each bug to `state=triaged`.

BUG-05 (Medium, marketplace URL sync) is already `state=verified` against
`7eb1c96` — it's on the queue for closure, not for triage.

## Why now

The Critical + the three Highs are all user-visible or dev-blocking today:

- BUG-01 silently downgrades 2FA on any user who clicks Setup after already
  enrolling. Security regression.
- BUG-04 breaks fresh Docker builds → next Render deploy would fail on
  container start.
- BUG-06 makes email change fail 100% against real BE.
- BUG-07 breaks logo display + upload in production (silent brand-identity
  loss + hard block on recruiter onboarding).

Getting these off `filed` unblocks four downstream fixes running in
parallel across FE and BE.

## What the receiver needs to do

Triage each row: set `assignee` + `state=triaged` in
[qa/bugs.md](../qa/bugs.md) (Manager owns those fields per
[../README.md](../README.md#bug-schema)). Ranked most-severe first:

| Bug | Severity | Suggested assignee | Rationale for the pick |
|-----|----------|--------------------|------------------------|
| [BUG-01](../qa/bugs.md#bug-20260728-01--critical) | Critical (P0) | **FE + BE, coordinated** | Two half-bugs stacked. FE needs a `totp_enabled` seam; BE needs `setup_totp` to reject when already enrolled. FE cannot fix without the BE seam. Note: the FE-session audit at [2026-07-28-fe-to-be-audit-blockers.md](2026-07-28-fe-to-be-audit-blockers.md) already flagged the FE half as P1 — my QA entry has the sharper BE root cause; both should point to the same fix PR. Handoff: [2026-07-28-qa-critical-totp-silent-disable.md](2026-07-28-qa-critical-totp-silent-disable.md). |
| [BUG-04](../qa/bugs.md#bug-20260728-04--high) | High (P1) | **BE** | Pure BE fix — three `pyproject.toml` files need `,<2` on the `mcp` constraint. Trivial patch, unblocks the Docker build. Handoff: [2026-07-28-qa-high-mcp-version-unpinned.md](2026-07-28-qa-high-mcp-version-unpinned.md). |
| [BUG-06](../qa/bugs.md#bug-20260728-06--high) | High (P1) | **FE** | Pure FE fix — widen `SettingsClient.requestEmailChange` signature, thread it through mock + real client, add the password `<Input>` to `ChangeEmailDialog`. BE contract is already correct (see `test_request_email_change_rejects_bad_password`). Handoff: [2026-07-28-qa-high-email-change-broken.md](2026-07-28-qa-high-email-change-broken.md). |
| [BUG-07](../qa/bugs.md#bug-20260728-07--high) | High (P1) | **FE** (with BE consult) | Fix A (small): add `NEXT_PUBLIC_STORAGE_URL`, thread it into `img-src`/`connect-src` in `middleware.ts`, add `blob:` to `img-src`. Fix B (durable): proxy S3 through admin — bigger call, needs BE. Recommend FE for the small fix + a Playwright profile guard, then BE follow-up if you want the proxy path. Handoff: [2026-07-28-qa-high-csp-blocks-s3.md](2026-07-28-qa-high-csp-blocks-s3.md). |
| [BUG-03](../qa/bugs.md#bug-20260728-03--medium) | Medium (P2) | **BE** | Add `size` arg to `presign_logo_upload` and forward as `content_length` to storage. Companion FE change to send the file size at the seam — small enough to bundle. Pinning test is already xfailing. |
| [BUG-02](../qa/bugs.md#bug-20260728-02--low) | Low (P3) | **FE** | One-line comment edit in `frontend/packages/ui/src/styles/tokens.css:6`. Can ride any FE PR. |

Also on your desk (not requiring action from you, just visibility):

- [BUG-05](../qa/bugs.md#bug-20260728-05--medium) is at `state=verified,
  verified_in=7eb1c96`. Move to `state=closed` and shift to `bugs-closed.md`
  per the lifecycle when you're ready.

## Success criteria

- Every row above moves to `state=triaged` with a written `assignee`
  within the [Manager SLA](../README.md#manager-sla-what-the-other-three-roles-should-expect)
  (P0 within 5 min, P1 within 15, P2 within 60, P3 weekly batch).
- BUG-05 moves to `state=closed` and gets appended to `bugs-closed.md`.
- `manager/status.md` bug-lifecycle roll-up reflects the new counts
  (0 filed, 5 triaged, 1 closed once BUG-05 lands there).

I'll pick up the fix-verified handoffs each FE/BE session opens per the
[Report-back convention](../README.md#report-back-convention-owner-role--manager-after-fixing).
