# Project conventions for Claude

These rules apply to every Claude session opened in this repo. They override defaults where they conflict.

## Branch model — single trunk

- This repo runs on **`main` only**, local and remote. There are no long-lived feature branches.
- Per-session work happens on a short-lived `claude/<random-name>` branch in an isolated worktree under `.claude/worktrees/<random-name>` — created by the `superpowers:using-git-worktrees` skill at session start (the default for non-trivial work).
- When the work is done: fast-forward `claude/<name>` into `main` and delete the branch + worktree. The repo should converge back to "main only" between sessions.
- If you want to skip the worktree pattern and work directly on `main` for a quick edit, tell the session **"work on main, don't create a worktree"** at the start. Otherwise the isolation default applies.
- **Never** create persistent feature/hardening/remediation/phase branches. If you find one lying around with zero unique commits, it's safe to delete.

## Git remote & identity

- This is a **personal GitHub repo** under `rugwedpatharkar/ai-interview-platform`. The remote uses a per-folder `includeIf` Git config that swaps in a personal `user.name`/`user.email` and the `github.com-personal` SSH alias.
- **Do NOT use the `gh` CLI here** — it authenticates against the office GitHub account by default and will fail or leak. All GitHub work goes through `git` directly (push, fetch, etc.) over the personal SSH alias.
- Commits should be authored as "Rugwed" (personal). The per-folder `includeIf` handles this automatically — don't override `user.name` / `user.email` per-commit.

## Merge & push pattern

- Merging to main: when the branch is `0 behind, N ahead` of `origin/main`, fast-forward push the branch ref directly into the remote main ref:
  ```bash
  git push origin claude/<name>:main
  ```
  This avoids touching the primary worktree's `main` checkout and keeps history linear. No PRs (personal repo, no review gate).
- If the branch is `M behind, N ahead`, merge `origin/main` into the branch first (resolve conflicts in-place), verify (typecheck + build), then fast-forward push.
- **Never** `git push --force` to `main`. If a force is genuinely needed, surface it as a question.
- **Never** `--no-verify`, `--no-edit` on rebase, or interactive `-i` flags (no interactive prompts available).

## Commit hygiene

- Stage **explicit paths** when committing — no `git add -A` / `git add .`. The repo has co-located generated files (`frontend/packages/api-client/src/gen/*`, lockfiles) and co-located build artifacts (`backend/.venv`, `*.egg-info`, caches) that a blanket add would sweep in.
- Commit **at each meaningful step** — many small commits beats one big one. Easier to review, easier to revert.
- One commit = one pattern category. "Drop nested try/except" is one commit; "Inline single-use helpers" is another.
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`). Subject ≤ 70 chars; explain "why" in the body, not "what".
- Include the Claude co-author trailer when Claude wrote the commit:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

## Workspace layout (high level)

The repo is a **two-root monorepo**: `backend/` (Python) and `frontend/` (TypeScript) are
fully separate — own toolchain, own deploy config (`backend/render.yaml`,
`frontend/apps/candidate/vercel.json`) — but share one git history so an API change and its
generated client land atomically.

- `backend/` — everything Python:
  - `services/` — the 4 services: `admin` (gRPC-web API), `ai-agents` (LangGraph/Gemini/LiveKit), `mcp-data`, `mcp-capability`. Each follows `app/model + app/resources (logic) + app/routes (thin RPC)`.
  - `lib/` — Python shared libs (errors, timeouts, audit, grpcweb translator)
  - `scripts/` — gate scripts (`check.sh` runs the full backend gate)
  - `docker/`, `deploy/`, `docker-compose.yml`, `ruff.toml`, `render.yaml`, `Dockerfile`
- `frontend/` — pnpm + turbo monorepo:
  - `apps/candidate` — the unified user-facing app (hosts both candidate-side `/...` and recruiter-side `/company/...` routes)
  - `apps/company` — legacy standalone recruiter app, kept alive for backward compat
  - `packages/ui` — Aperture Pro design system (`@ip/ui`)
  - `packages/shared` — auth, transport, useAuth (`@ip/shared`)
  - `packages/api-client` — generated gRPC clients (`@ip/api-client`); `pnpm gen` reads protos from `../../../backend/services/{admin,ai-agents}/app/routes/pb`
- `docs/superpowers/` — specs, plans, issue registers (planning canon)
- `docs/brand/` — design system + redesign mockups

## Per-language rules

- **Python:** see `~/.claude/CLAUDE.md` for the global Python ruleset (anti-defensive, anti-nested, trust-the-system). Applies to all `backend/services/`, `backend/lib/`, `backend/scripts/` work.
- **TypeScript:** no comments by default — only WHY-not-WHAT for non-obvious constraints. Stage explicit paths. Run `tsc --noEmit` per affected package before commit.

## Verification gates

- Backend: `bash backend/scripts/check.sh` — 5 suites + ruff + pip-audit + log-coverage + timeouts gates. Must pass. (The venv lives at `backend/.venv`.)
- Frontend per-package typecheck: `cd frontend && npx pnpm@9.15.0 --filter @ip/<pkg> exec tsc --noEmit`. Must return 0.
- Frontend per-app build: `cd frontend && npx pnpm@9.15.0 --filter @ip/<app> build`. Never run while a dev server is live on the same app.
- Browser verification for previewable changes: start dev via `preview_start`, walk the change with `preview_eval` / `preview_snapshot` / `preview_screenshot`. Don't ask the user to test — verify and share proof.

## Anti-patterns to avoid

- Routing `/public/*` (SEO pages), `/auth/oauth/*` (OAuth redirects), or LiveKit webhook traffic over gRPC-web — those stay HTTP/REST.
- Importing `lucide-react` (value imports) inside `@ip/ui`. Type-only `import type { LucideIcon }` is fine. Inline SVGs in the package; lucide stays in app code.
- Mocking the database in backend tests — integration tests hit a real Mongo (prior incident: mocked tests passed but a prod migration broke).
- Storing official/sensitive candidate documents — the platform's data scope is **general recruiting profile only** (resume, education, name, age, location, preferences, email). No PII beyond that.

## Documentation discipline

- Specs in `docs/superpowers/specs/YYYY-MM-DD-<topic>.md` (via `superpowers:brainstorming`).
- Plans in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (via `superpowers:writing-plans`).
- Issue registers in `docs/superpowers/plans/YYYY-MM-DD-*-issues.md` — separate FE vs BE files. Mark items SOLVED with commit SHA + branch when fixed.
- HANDOFF docs when a session ends mid-stream so the next session can resume cleanly.
