# Bugs (closed archive)

Append-only. Manager moves entries here from `bugs.md` on `state=closed`.

## BUG-20260728-05  [Medium]
- state: closed
- assignee: FE
- filed_by: QA in 5e2f991
- fix_sha: 7eb1c96
- verified_in: 7eb1c96
- area: `/jobs` marketplace — URL is one-way for search / filter / sort state
- repro:
  1. `next dev -p 3000 NEXT_PUBLIC_MOCK=1`. Navigate to `http://localhost:3000/jobs?q=frontend` → the input is seeded with "frontend" and results filter correctly. Good so far.
  2. Type any different value in the search input, hit Search. Results update. Check `location.href` — pre-fix, still `/jobs?q=frontend`.
  3. Click a filter chip (Remote / Hybrid / On-site). Results update. `location.href` — pre-fix, unchanged.
  4. Reload the page. Pre-fix, all user input is lost — only the *initial* query-string value comes back.
- expected: The URL is the source of truth for search / filter / sort / page state. Every user action pushes a new URL so reload, back/forward, and share/bookmark all recover the same result set.
- actual (pre-fix): `frontend/apps/candidate/app/jobs/marketplace.tsx` held `params` in `useState`; `setFilters`/`setParams`/`goToPage` updated local state only, no router push. Bookmarks/back/reload all broke.
- test: [frontend/e2e/marketplace-search-url.spec.ts](../../../frontend/e2e/marketplace-search-url.spec.ts) — two Playwright regression guards (search + filter both push to URL). Both pass live against HEAD.
- notes:
  - QA 2026-07-28 20:10 UTC — filed after live driving. XSS properly escaped; SQL-flavored strings do not crash — only bug in this hunt lens was the URL-sync gap.
  - QA 2026-07-29 11:40 UTC — verified against 7eb1c96 ("feat(fe): sync marketplace filter/sort/page state to the URL"). Pinning tests unexpected-passed after merge; converted `test.fail(...)` → `test(...)` in the same spec so they now guard the regression going forward.
  - MGR 2026-07-29 12:30 UTC — closed. Archived here from `bugs.md`.
