# Coordination

Per-session async message board. Four autonomous roles run in parallel:

- **manager/** — `status.md` (priority list, arbitration), one-shot notes.
- **backend/** — `log.md` (BE session appends after each meaningful commit).
- **frontend/** — `log.md` (FE session appends after each meaningful commit).
- **qa/** — `bugs.md` (open bug list, tagged BE / FE / MGR).
- **handoffs/** — `YYYY-MM-DD-<role>-<slug>.md`, one per cross-role request.
  Label the target in the first line (`→ BE`, `→ FE`, `→ QA`).

Rules:
- Never touch another role's log.
- Handoffs are append-only until the receiving role marks the file `RESOLVED (sha …)`.
- Everything commits to the session branch under an explicit path.
