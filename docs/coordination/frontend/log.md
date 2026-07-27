# Frontend engineer log

Append-only. Entries newest first inside each day. Format:

```
## YYYY-MM-DD HH:MM — <route or component>
- what changed (1–2 lines)
- commit sha
- open questions (if any)
```

---

## 2026-07-28 — session start

- Branch: `claude/candidate-frontend-audit-1ae381` (isolated worktree)
- Scope: 58 pages under `frontend/apps/candidate/app/**`, plus `@ip/ui` and `@ip/shared`.
- Layout: single Next.js 15 app (`@ip/candidate`), light-only, Aperture design system,
  React Query + AuthProvider + ObservabilityBoundary at the root.
- Marketing landing is server-rendered as `children`; dashboard swap happens post-mount
  once the localStorage token resolves.
- Kicking off route-group audit sweep next (see `docs/coordination/frontend/audit/`).
