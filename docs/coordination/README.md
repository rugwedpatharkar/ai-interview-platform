# Coordination protocol

Single source of truth for how the four parallel sessions (Manager, Frontend,
Backend, QA) stay in sync via git-committed markdown.

## Directory layout

    docs/coordination/
      README.md                  ← this file (protocol)
      manager/
        status.md                ← Manager's live status (top-of-mind view)
      frontend/
        log.md                   ← FE session appends here per iteration
      backend/
        log.md                   ← BE session appends here per iteration
      qa/
        log.md                   ← QA session appends here per iteration
        bugs.md                  ← open bugs (all states except closed)
        bugs-closed.md           ← append-only archive of closed bugs
      handoffs/
        <yyyy-mm-dd>-<slug>.md   ← one file per cross-role handoff

## File ownership (bounded fields, merge-safe)

| File                    | Writer                    | Reader          |
|-------------------------|---------------------------|-----------------|
| manager/status.md       | Manager                   | everyone        |
| frontend/log.md         | FE (append-only)          | everyone        |
| backend/log.md          | BE (append-only)          | everyone        |
| qa/log.md               | QA (append-only)          | everyone        |
| qa/bugs.md              | shared, bounded fields    | everyone        |
| qa/bugs-closed.md       | Manager (append-only)     | everyone        |
| handoffs/<file>.md      | opener + labelled target  | everyone        |

For `qa/bugs.md`, each role owns specific fields — see BUG SCHEMA below.

## Sync protocol (all four roles)

Before any real work each iteration:

```bash
git fetch origin main
git rebase origin/main            # or `git merge --ff-only origin/main`
# if that fails, resolve; if you can't, ping Manager via handoff and idle.
```

After any coord-file change (log/handoff/status/bugs):

```bash
git add <that one file>
git commit -m "chore(coord): <one-line summary>"
git push origin <your-branch>:main   # fast-forward safe; coord writes are tiny.
```

After any product-code commit: rebase-then-push into main via the project's
fast-forward pattern. Never mix product-code changes with coord writes in the
same commit.

Timing: poll `origin/main` every iteration. Manager's target latency for
`status.md` refresh is ≤ 15 min after the last log entry.

## Log entry format

Each role appends to its `log.md`:

    ## 2026-07-22 14:32 UTC — session-<slug>
    - <one-line what you did>
    - <one-line what you're doing next>
    - blockers: <none | one-line description + who you need>
    - commits: <sha>, <sha>

## Handoff format

`handoffs/<yyyy-mm-dd>-<slug>.md`:

    ---
    from: <FE|BE|QA|MGR>
    to:   <FE|BE|QA|MGR|Multiple>
    priority: <Critical|High|Medium|Low>
    state: <open|in_progress|done>
    opened: 2026-07-22 14:32 UTC
    ---

    ## What
    <one paragraph>

    ## Why now
    <one line>

    ## What the receiver needs to do
    - <bullet>
    - <bullet>

    ## Success criteria
    - <how the opener will know it's done>

## Bug lifecycle

    QA files       → state=filed
    Manager triage → state=triaged  (sets assignee + priority)
    Owner starts   → state=in_progress
    Owner fixes    → state=fixed    (sets fix_sha)
    QA verifies    → state=verified (or reopens → in_progress)
    Manager closes → state=closed, moves to bugs-closed.md

The only synchronous handoff is Manager triage (state=filed → triaged).

## Bug schema

Every entry in `qa/bugs.md`:

    ## BUG-<yyyymmdd>-<nn>  [<Critical|High|Medium|Low>]
    - state: <filed|triaged|in_progress|fixed|verified|closed>
    - assignee: <FE|BE|unassigned>
    - filed_by: QA in <sha>
    - fix_sha: <sha or "-">
    - verified_in: <sha or "-">
    - area: <route or module path>
    - repro:
      1. <step>
      2. <step>
    - expected: <one line>
    - actual: <one line + grpc-status / HTTP code / screenshot ref>
    - test: <path to failing / pinning test>
    - notes:
      - <role-initials> <timestamp> — <one-line comment>

Field ownership (why concurrent commits merge cleanly):

| Field          | QA        | Manager   | FE / BE (assignee) |
|----------------|-----------|-----------|--------------------|
| state          | filed → verified | filed→triaged, verified→closed | triaged→in_progress→fixed |
| assignee       | never     | sets/reassigns | never |
| filed_by       | writes    | never     | never |
| fix_sha        | never     | never     | writes |
| verified_in    | writes    | never     | never |
| priority       | never     | writes    | never |
| repro/area     | writes    | may refine | never |
| notes          | append "QA …" | append "MGR …" | append "FE …" / "BE …" |

## Report-back convention (owner-role → Manager, after fixing)

When you land a fix that closes a Critical/High bug OR completes a top-3
priority in `status.md`, do this in the same push:

1. Update the bug entry to `state=fixed` with the commit sha.
2. Append one line to your role's `log.md`:
   `2026-07-22 14:42 — closed BUG-<id> in <sha>; ready for QA verify`
3. Create a handoff at `handoffs/<yyyy-mm-dd>-fix-BUG-<id>.md` with:
   - to: QA
   - commit sha
   - what changed (1 line)
   - what to re-run to verify (1 line)

## Manager's coordination loop

Runs on a timer OR after every push observed on `origin/main`:

1. `git fetch origin main` — see what landed since last poll.
2. Read all three logs.
3. Read all files in `handoffs/`. Label each with owner role.
   Poke stale (>48h) ones in `status.md`.
4. Read `qa/bugs.md`. Sort by severity. Ensure every Critical/High is
   assigned.
5. Update `manager/status.md` — including the bug-lifecycle roll-up
   (counts per state, computed by grepping `state:` fields).
6. Commit + push whenever any bucket changes.

## Manager SLA (what the other three roles should expect)

- Every `state=filed` bug is either `state=triaged` **or** has an
  explicit "not a bug" note in `status.md` **within 30 min**.
- Priority framework (in order):

  | Priority | Definition                              | Assign within | Notes                          |
  |----------|-----------------------------------------|---------------|--------------------------------|
  | P0       | Critical + data loss / security         | 5 min         | Freeze conflicting merges      |
  | P1       | High + user-visible                     | 15 min        |                                |
  | P2       | Medium                                  | 60 min        |                                |
  | P3       | Low                                     | Weekly batch  |                                |

- Reassignment: if QA disputes a fix (state moves back to `in_progress`
  with a reopen note), Manager reads both sides and decides in
  `status.md`, e.g. "MGR 2026-07-22 14:55 — BUG-20260722-03 stays with
  BE; the reopen is a distinct edge case, filing BUG-20260722-11 for FE".
- Closing: **only Manager sets `state=closed`.** Manager moves closed
  entries into `qa/bugs-closed.md` so `qa/bugs.md` stays small.

## What Manager does not do

- Never writes product code (any file under `frontend/**` or `backend/**`).
  If Manager spots a typo in code, files a QA-style bug and lets the owner
  fix it.
- Never deletes a role's log entry (may summarize in `status.md`).
- Never promises deadlines the owning role didn't state.
- Never `git push --force` to main.

## Completion signal

When `## Priorities` is empty AND `## Blockers` is empty AND
`## Bug summary` shows `Critical=0 High=0`, Manager marks `status.md` with
`## STABLE — release-ready at <sha>` and idles. If any of those refill,
Manager resumes the loop.
