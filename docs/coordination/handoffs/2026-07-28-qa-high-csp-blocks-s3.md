---
from: QA
to:   FE
priority: High
state: open
opened: 2026-07-29 03:15 UTC
---

## What

BUG-20260728-07. The production CSP set by `frontend/apps/candidate/middleware.ts` is `img-src 'self' data:` and `connect-src 'self' <ADMIN> <AIAGENTS>` — neither includes the S3 origin where presigned URLs live, nor `blob:` for local file previews. In prod:

- Every company logo `<img src={presignedS3Url}>` fails silently and swaps to initials via the Avatar `onError` fallback. Users never see any brand identity on job cards or company profiles.
- Every `<img src={URL.createObjectURL(file)}>` preview in the branding editor is blocked (blob: not in img-src).
- Every `PUT` to a presigned upload URL is blocked by `connect-src` — logo upload is 100% broken.

Dev mode does not exercise the strict policy, and the d9add1a verification note only covered scripts + landing hydration.

## Why now

Silent brand-identity failure across the whole marketplace, plus a hard block on the recruiter onboarding surface (upload your logo).

## What the receiver needs to do

Pick one:

- **Fix A (small):** add `NEXT_PUBLIC_STORAGE_URL` env var (default the S3 endpoint used today). Thread it into both `img-src` and `connect-src` in middleware.ts. Add `blob:` to `img-src` so local previews render.
- **Fix B (durable):** proxy all storage traffic (logo GET + logo PUT + recording playback) through the admin service. All requests stay same-origin, no CSP relaxations needed.

Whichever path, add:

- A Playwright suite `frontend/e2e/csp-prod.spec.ts` behind a `PLAYWRIGHT_PROD=1` guard that runs against `next start`, navigates to a page with a signed logo, and asserts the image loads (or that the browser reports no CSP violation on that specific request).
- A dev seed / mock storage domain so the smoke suite has a repeatable target.

## Success criteria

- On a prod build (`NODE_ENV=production next build && next start`):
  - Company logos render on `/companies/[id]` and `/jobs/[id]`.
  - Branding editor local preview renders after file pick.
  - Logo upload PUT succeeds; the returned key is persisted.
  - Browser console has zero CSP violations on those flows.
- The new `csp-prod` Playwright suite runs green in CI.
- Bug entry moves to `state=verified` with a new `verified_in` sha.
