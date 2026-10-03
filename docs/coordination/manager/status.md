# Aptura — Coordination Status
_Last update: 2026-07-29 12:30 UTC by Manager_
_Head of main: 19124a5_
_Manager session: engineering-coordination-manager-ce28a0_

## Priorities (in order — top is next)

1. **[BE] BUG-04 — pin `mcp<2` in three pyproject.toml files** (5 min, P1)
   Trivial. Unblocks the Render single-container Docker build and QA's
   `mcp-data` test collection. Do this before anything else on the BE side.
   → [BUG-20260728-04](../qa/bugs.md#bug-20260728-04--high)
2. **[BE→FE] BUG-01 — TOTP silent-disable (P0 Critical, security regression)**
   Sequenced: BE lands (a) `setup_totp` refuses when `totp_enabled=True`
   and (b) exposes `totp_enabled` on `getAccount`/`me`; FE then reads the
   seam and gates the "Set up 2FA" button + kills the dialog-on-open auto-fire.
   FE cannot fix without BE's guard; a client-only fix leaves the destructive
   RPC path open. → [BUG-20260728-01](../qa/bugs.md#bug-20260728-01--critical)
3. **[BE] Start on the standing FE→BE audit queue (9 P0/P1s)** — BE session
   hasn't opened this yet.
   → [handoffs/2026-07-28-fe-to-be-audit-blockers.md](../handoffs/2026-07-28-fe-to-be-audit-blockers.md).
   The FE-side halves of most items already shipped in 07fd159…b02e423.
4. **[FE] BUG-07 — CSP for S3 (P1, blocks prod logo upload)**
   Take Fix A (small): add `NEXT_PUBLIC_STORAGE_URL`, thread into
   `img-src` + `connect-src` in `middleware.ts`, add `blob:` to `img-src`.
   Ship `frontend/e2e/csp-prod.spec.ts` behind `PLAYWRIGHT_PROD=1` in the
   same PR. → [BUG-20260728-07](../qa/bugs.md#bug-20260728-07--high)
5. **[FE] BUG-06 — change-email dialog missing password field (P1)**
   Extend `SettingsClient.requestEmailChange(newEmail, currentPassword)`,
   thread mock + real, add password Input.
   → [BUG-20260728-06](../qa/bugs.md#bug-20260728-06--high)
6. **[BE] BUG-03 — logo upload size cap (P2)**
   Add `size` to the resource sig, forward as `content_length`. Coordinate
   with FE on a sha so `branding-client.ts` sends the size at the seam.
   → [BUG-20260728-03](../qa/bugs.md#bug-20260728-03--medium)
7. **[FE] BUG-02 — comment rot in tokens.css:6 (P3)** — one-line edit,
   bundle onto any FE PR touching `@ip/ui`. Do not open a dedicated PR.
   → [BUG-20260728-02](../qa/bugs.md#bug-20260728-02--low)

## In-flight

- **FE (`claude/candidate-frontend-audit-1ae381`)** — extremely active.
  Landed 12 audit-driven fixes (`ba76c3c…b0359eb`) + a full modernization
  workflow: 109 findings, 6 implementation waves (`07fd159…b02e423`),
  three route groups (candidate + a11y, dark-AI plumbing, recruiter
  productivity), plus RSC/loading/a11y/DS polish. Bundle drops recorded
  in the FE log (e.g. /login 156kB was 243kB, /jobs 198kB was 250kB).
  Next: sister-pattern audits of `/profile`, `/applications/[id]`,
  `/schedule`, plus recruiter productivity wave 3.
- **BE (`backend/log.md`)** — **not started this cycle.** log stub only.
  See Blockers.
- **QA (`claude/session-f6e0b0`)** — active. This iteration: verified
  BUG-05 (converted `test.fail` guards to permanent `test(...)` in
  `marketplace-search-url.spec.ts`), opened BUG-06 + BUG-07, opened the
  MGR triage batch handoff. Blocked-but-now-unblocked on Manager triage
  (this iteration cleared it).

## Blockers

- **BE session has not been spawned.** The whole BE queue — BUG-04 (5-min
  Docker-build fix), BUG-01's BE half (P0 security regression), BUG-03,
  and the 9 P0/P1 items in `handoffs/2026-07-28-fe-to-be-audit-blockers.md`
  — is waiting on nobody. Manager can't spawn the session; flagging here
  loudly so the human loop knows to start it.
- **No prod-build Playwright profile** — QA can't pin BUG-07 without it.
  Handoff proposes adding `frontend/e2e/csp-prod.spec.ts` behind a
  `PLAYWRIGHT_PROD=1` gate as part of the BUG-07 fix; that unblocks the pin.
- **QA has no Docker on the current host** — cannot exercise real BE
  flows (TOTP challenge, upload PUT, interview session). All BE-touching
  bug verifications will need a QA host with Docker or a live staging URL.

## Merge queue (avoid conflicts)

Sessions have been rebasing cleanly (see `b66cf20` merging main into FE).
Expected next pushes, ordered:

1. **BE:** BUG-04 mcp pin (3 pyproject.toml touches only — zero conflict surface).
2. **BE:** BUG-01 backend half (`admin/app/resources/settings.py`, `settings.proto`, admin tests — no FE overlap).
3. **FE:** BUG-07 CSP fix (`frontend/apps/candidate/middleware.ts`, `.env.example`s, new `e2e/csp-prod.spec.ts`).
4. **FE:** BUG-06 change-email (`components/settings/change-email-dialog.tsx`, `settings-client.ts`, test).
5. **FE:** BUG-01 frontend half (`security-tab.tsx`, `settings-client.ts` — same file as BUG-06's client → do them together in one FE PR to avoid two edits to the same file).
6. **BE:** BUG-03 presign size cap (`admin/app/resources/company_profile.py`, admin tests, x-fail flip).
7. **FE:** BUG-02 tokens.css comment (ride any of the above FE PRs).

No apparent conflicts — different files. If BUG-06 + BUG-01 FE-half both
touch `settings-client.ts`, land them in one PR.

## Bug summary

Critical: 1  High: 3  Medium: 1  Low: 1
Closed this iteration: BUG-05 (Medium, marketplace URL sync, fixed in 7eb1c96,
verified in 7eb1c96) — archived to `qa/bugs-closed.md`.
See `docs/coordination/qa/bugs.md` for open detail.

## Bug lifecycle (from qa/bugs.md)

filed:        0  ← Manager SLA — triage now
triaged:      6  ← assigned; awaiting owner start
in_progress:  0  ← being worked
fixed:        0  ← waiting on QA to verify
verified:     0  ← Manager to close next iteration
closed:       1  (archived to qa/bugs-closed.md — BUG-05)

## Freeze

None. BUG-01 (Critical) is already in the tree; freezing merges doesn't
help it — the fix needs to land. Will re-evaluate if a new Critical
regression lands on top.

## Notes for this iteration

- MGR SLA reality-check: BUG-01 was filed 2026-07-28 19:30 UTC — first
  Manager triage pass came 2026-07-29 12:30 UTC (~17h). Root cause:
  Manager was polling but the coord dir was empty on the first N passes;
  bugs.md filled up between polls without a signal. Next iteration:
  Manager should watch `origin/main` commits for `test(qa):` or
  `chore(coord):` markers as an earlier trip-wire.
- FE and QA have been operating cleanly against the merge/rebase protocol
  (I see `b66cf20 Merge remote-tracking branch 'origin/main' into
  claude/candidate-frontend-audit-1ae381` and QA's own merge commits).
  BE has zero commits in this cycle — nothing to review yet.
- Nothing to poke as stale (>48h) yet — earliest bug is 41h old but was
  just triaged.
