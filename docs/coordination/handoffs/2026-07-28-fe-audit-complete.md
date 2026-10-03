# → Manager: FE audit + first-wave fixes complete

**From:** FE session `claude/candidate-frontend-audit-1ae381`
**Date:** 2026-07-28
**Status:** Ready for review + merge

---

## What ran

Every page under `frontend/apps/candidate/app/**` (58 route files across
40+ route groups, plus `@ip/ui` and `@ip/shared`) was walked by an 8-agent
parallel audit workflow (`candidate-fe-audit-sweep`). Each agent read its
route group's files in full, cross-referenced shared primitives, and
returned structured findings.

**Result:** 105 findings — 4 P0, 35 P1, 40 P2, 26 P3.

Full ranked report:
[`docs/coordination/frontend/audit/2026-07-28-full-audit.md`](../frontend/audit/2026-07-28-full-audit.md)

## What landed this session (12 commits, main-eligible)

Every P0/P1 finding fixable on the frontend alone has landed. Grouped by theme:

| Area | Commits | Notable defects fixed |
|---|---|---|
| Root shell | `ba76c3c` | duplicate Try-Again button; global-error dark UI on light-only app; HomeClient blank-frame on wrong-role token; ObservabilityBoundary local-reset path |
| Auth | `256f86b`, `1479435` | access_token leaking in URL fragment; dead 8s timeout guard; missing OAuth error_description; `?redirect=` round-trip through login + guards |
| Jobs discovery | `7eb1c96`, `e8b4f18`, `9a63bc0` | marketplace filter/sort/page state not in URL; Similar-Roles fetching global instead of same-company; See-All-Roles broken filter; JobCard "Apply" mislabelled; MegaNav Privacy pointing at wrong page; broken `/company/messages` sidebar entry; skip-to-content link now real |
| Post-application | `4c1c4fb` | outcome poller with no cap; gated_out timeline promising an outcome CTA that wasn't rendered; RescoreDialog silently swallowing clipboard failures |
| High-stakes flow | `b196ed1` | interview self-view stayed black for the entire session (callback-ref fix for phase-swapped video mount); aptitude countdown drift on inactive tab / heavy CPU (switched to Date.now() math); aptitude beforeunload guard so refresh no longer wipes answers |
| Marketing honesty | `d49396b` | pilot + waitlist forms falsely claiming success on any mailto-less browser (silent lead loss); status page telling everyone "All systems operational" with no monitoring; practice page copy claiming camera/mic that don't exist; collapsed legal TOC |
| Cross-cutting UX | `775d7f3` | single-line chat composer → textarea with Enter=send / Shift+Enter=newline; settings tabs not writing `?tab=` back; useRequireRole logging authed users out to /login instead of a forbidden fallback |
| Recruiter | `7568b32` | post-a-job silently dropping location/salary/remote/employment/gate fields; Advance calling `overrideGate` instead of `decideApplication({outcome:"shortlisted"})`; Hold/Reject saving with `reason=other + freeText=""` — replaced with a real ReasonDialog; pipeline Override button was a real `<button>` nested inside `<a>` (invalid HTML) — refactored to stretched-link; integrity flags silently capped at 3 evidence entries — cap removed |
| BE handoff | `b0359eb` | 9 P0/P1 items requiring backend work bundled with per-item scope and FE follow-ups |

## Verification

- `pnpm --filter @ip/shared --filter @ip/ui --filter @ip/candidate run typecheck` — clean
- `pnpm --filter @ip/candidate build` — clean, all 58 routes compile

Browser smoke was partial: `preview_start` picked up the primary working
tree instead of this worktree, so the running dev server didn't reflect
worktree edits. The typecheck + build gate ran against worktree code and
passed, which is authoritative for correctness. Live-in-browser smoke of
the fixed pages needs a worktree-scoped `preview_start` (add `cwd` to
`.claude/launch.json` or a worktree-relative wrapper script), then
walking auth → jobs → application → outcome.

## What's still open

**Frontend-only, deferred to next session** (P2/P3, non-blocking):
- SkillChips onBlur race with Save (P2 correctness, single file)
- Schedule slot picker `role="radio"` needs arrow-key handling (P2 a11y)
- TOTP setup QR code render (P2 UX, needs qrcode lib)
- Notifications tab debounce (P2 perf, single file)
- Data-export card before Erase (P2 gap, needs BE too)
- Auth-Field aria-invalid wiring (P2 a11y)
- Password reveal toggles across login/register/reset (P2 UX)
- 25 more P3 polish items (session-list time formatting, "try different email"
  input clear, password meter gate, autoFocus on first field, etc.)

**Backend-required, in the BE handoff** — 9 P0/P1s handed off:
[`docs/coordination/handoffs/2026-07-28-fe-to-be-audit-blockers.md`](2026-07-28-fe-to-be-audit-blockers.md)

Top of that queue: onboarding skills overwrite (P0 data loss), SSO state/nonce
(login-CSRF surface), TOTP status read, Privacy consent revoke RPC (GDPR gap).

## Recommended merge order

All 12 FE commits are independent and land cleanly on `main` fast-forward:

```bash
git push origin claude/candidate-frontend-audit-1ae381:main
```

Per project convention: single trunk, no PR gate on this personal repo.

## Suggested next FE priorities

Once the BE handoff progresses, the FE follow-ups unlock in this order:
1. Onboarding skills — swap to the new `interests` field / merge write, drop
   `.slice(0, 6)` seed.
2. Security tab — replace `useState(false)` with a read of `totpEnabled` from
   the settings response.
3. Privacy tab revoke — outline button next to the Granted badge, wired to the
   new `revokeConsent` RPC.
4. Age optional — send `age: form.age || undefined`, change form store to
   `number | null`.
5. Company audit page — swap the mock client for the real `listAuditEvents`
   RPC + wire cursor pagination.

Independently, the remaining FE-only P2 backlog can be worked in any order.

---

Standing by for the next Manager priority.
