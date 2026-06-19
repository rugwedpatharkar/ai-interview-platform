# Screen: Practice + skill-gap feedback — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 5, growth).
> **Routes:** `apps/candidate/app/practice/page.tsx` (start a mock interview) + `apps/candidate/app/feedback/[id]/page.tsx` (skill-gap feedback) · **Mockup:** `aptura_practice_and_growth` · **Pillar:** [candidate-growth](../../v2/2026-06-19-candidate-growth.md)
> **Goal:** A candidate self-serves an AI mock interview that **reuses the live interview brain unchanged but is fully detached from the funnel** (no `comp_id`, no `job_id`, no recruiter visibility, no funnel event), then sees **skill-gap growth feedback** (strengths / gaps / suggested topics) — **private, unscored, never shown to employers, no hire/reject verdict**.

This screen is **detached by type**, not by convention. The practice REST client takes **no `comp_id`/`applicationId` in any signature** — the same invariant the backend enforces (`practice.py` takes no `publisher`) reaches the FE client surface. The chat turn-loop UI is a **clone** of the real text-interview page (`app/interview/[applicationId]/page.tsx`) with the proctoring/consent pieces **removed** (practice is private, no proctoring).

The `[id]` in `feedback/[id]` is a **`practice_id`** — it renders a read-only growth panel for a past practice run (reuses `GET /practice/{id}/feedback`). (The separate post-decision *application* feedback surface — `GET /application/{id}/feedback`, terminal-state-gated — is **not** this screen; it stays on the existing comp-scoped client so practice stays detached. See pillar Task 8 Step-3 note + Step 6b.)

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** ai-agents FastAPI REST (mirrors `routes/interview_api.py`), behind the injected-LLM seam.

Practice **reuses the interview brain unchanged** (`build_blueprint` → `next_question` → `evaluate_interview`) via a new detached `resources/practice.py` that holds **no `publisher`** — emitting a funnel event from practice is impossible by type. Finalize runs `evaluate_interview` + a new `feedback_writer` **inline for the candidate** and persists a `PracticeSummary`. In-flight sessions live in a `RedisPracticeStore` (copy of `RedisInterviewStore`, namespace `practice`).

### Endpoints

```
POST /practice/start            {topic?: str, jd_text?: str}      → {practice_id: str, question: str}
POST /practice/{practice_id}/turn   {answer: str}                 → {done: bool, question: str}
GET  /practice/{practice_id}/feedback                             → {evaluation_summary: str, feedback: GrowthFeedback}
GET  /practice/sessions                                           → {sessions: [{practice_id, role_label, created_at}]}  (R5, owner-scoped)
```

Where `GrowthFeedback = {summary: str, strengths: [str], gaps: [str], suggested_topics: [str]}` — **no `recommendation`/score field** (enforced in the model + the render layer).

**Request/response fields:**

- **`POST /practice/start`** — body `{topic?, jd_text?}`. **Exactly one** of `topic`/`jd_text` required (boundary check → `400` if neither, `400` if both blank). When only `topic`: a tiny fenced `_synthesize_jd(topic)` (`_topic_to_jd_prompt` + `_SynthJD{jd_text}`, 4–6 sentence JD) synthesizes the JD, raw `topic` fenced with `fence('topic', topic)` + `UNTRUSTED_NOTICE`. Pasted `jd_text` used verbatim (skips synthesis). Builds a `CandidateProfile` from `data.get_profile(user_id)` (minimal fallback if none); `blueprint = build_blueprint(jd_text, profile, llm=llm)` (**no `question_plan`** — practice never crawls); `next_question` → first question. Persists a `PracticeSession` (new uuid `practice_id`, `started_at`, `status="in_progress"`). → `{practice_id, question}`.
- **`POST /practice/{id}/turn`** — body `{answer: str}`. Load session; `404` if missing, `403` if `session.user_id != caller`, reject (`409`) if `status != "in_progress"`. Append turn; budget-exhausted hard stop → finalize; else `next_question` → if `done` finalize, else save. → `{done, question}` (`question` empty when `done`).
- **`GET /practice/{id}/feedback`** — load the completed `PracticeSummary` via `data.get_practice_summary(user_id, practice_id)`; `409` if still in progress (the UI treats `409` as "still finalizing", polls). → `{evaluation_summary, feedback}`.
- **`GET /practice/sessions`** — `data.list_practice_summaries(user_id)`, **owner-scoped** (`user_id` is the caller, never a client param). Compact projection only (`{practice_id, role_label, created_at}` — no transcript/evaluation). → `{sessions: [...]}`.

**Auth/scope:** bearer (candidate token), `_caller_user_id` from the token (mirror `interview_api`). **No `comp_id` anywhere** — `practice_sessions` is keyed by `user_id`. Ownership checked in the resource (`403` driving another user's practice). Status mapping (mirror `interview_api`): `NotFoundError`→404, `ForbiddenError`→403, `ValidationError`→400, still-in-progress→409, no/invalid token→401.

**Backed by:**
- `src/ai-agents/app/resources/practice.py` (NEW — `start_practice` / `submit_practice_turn` / `_finalize`; **no `publisher` parameter anywhere**) + `resources/feedback_writer.py` (NEW — `build_feedback(evaluation, *, llm) -> GrowthFeedback`; `_STRENGTH_BAND = 0.70`, `_GAP_BAND = 0.50`; pure `_classify` buckets competencies **before** the LLM phrases them; no new scoring).
- `src/ai-agents/app/infra/practice_sessions.py` (NEW — `RedisPracticeStore`, ns `practice`, TTL ≥ `blueprint.time_budget_min*60 + reaper margin`).
- **Collection:** `practice_sessions` **keyed by `user_id` (never `comp_id`)**. Indexes (single authority `src/mcp-data/app/infra/db.py`): `(user_id)` — powers both history `find({user_id}).sort(created_at)` **and** the erasure `delete_by_user(user_id)` — and `(user_id, practice_id)` for single-run reads. Joins the Inc 0 `CandidateEraser` cascade.
- **mcp-data tools:** `save_practice_summary(user_id, summary)` / `get_practice_summary(user_id, practice_id)` / `list_practice_summaries(user_id)` (mirror `save_interview`/`get_report`).

**Detached invariant (test-locked):** a finalize test asserts **no event is emitted** — there is no `publisher` in the signature to call. **Never-mid-funnel (hard rule):** practice feedback is always allowed (detached); the *separate* real-application `GET /application/{id}/feedback` is **default-deny** over `ApplicationState` (terminal-only: `hired, rejected, shortlisted, gated_out, expired, withdrawn, abandoned`; **`scored` is denied**) — not part of this screen's client.

**REST file:** `src/ai-agents/app/routes/interview_api.py` (+ the four routes), `main.py` (+`practice_sessions` store in `create_app` deps). **Pillar cross-ref:** [candidate-growth](../../v2/2026-06-19-candidate-growth.md) Tasks 1–7 (brain reuse, feedback bands R1, topic→JD R2, budget reuse R3, history R5, status order R6, indexes R7).

**FE mock shape** (`apps/candidate/app/practice/types.ts`) — the FE codes against this until the endpoints land:

```ts
export interface GrowthFeedbackView {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggested_topics: string[];
}
export interface PracticeStartResult { practice_id: string; question: string; }
export interface PracticeTurn { done: boolean; question: string; }
export interface PracticeFeedbackResult { evaluation_summary: string; feedback: GrowthFeedbackView; }
export interface PracticeSummaryRow { practice_id: string; role_label: string; created_at: string; }
// The detached invariant reaches the type surface: NO comp_id / job_id / applicationId anywhere.
export interface StartArgs { topic?: string; jd_text?: string; }
```

---

## B. Frontend plan (TDD, bite-sized)

> **Grounding (verbatim from real code — mirror, don't invent):**
> - **REST client shape:** `frontend/packages/shared/src/interview.ts` (`makeInterviewClient(baseUrl, store)`) + `jd.ts` (`createJdClient`) — both `restAuthFor(store)` → a `post<T>`/`get<T>` pair via `authedFetch`, parsing `{detail}` and throwing `HttpError(res.status, detail ?? "Request failed (status)")`. Barrel: `frontend/packages/shared/src/index.ts`.
> - **Chat turn-loop to clone:** `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` — the `phase`/`turns`/`current`/`answer`/`busy`/`error`/`ended` machine, the **`inFlight = useRef(false)`** latch (`if (inFlight.current) return; inFlight.current = true;` … `finally { inFlight.current = false; }`) + the `abortCtrl = useRef<AbortController|null>(null)` aborted on unmount, the `isSessionEnded(err)` 409/410 terminal check, the `beforeunload` warning while `phase==="active"`, the `role="log" aria-live="polite"` transcript, the `role="status" aria-live="polite"` current question, the `⌘/Ctrl+Enter` `onKeyDown`.
> - **`@ip/ui` exports** (`frontend/packages/ui/src/index.ts`): `Button` (`variant`: default/secondary/outline/ghost/destructive/link · `loading` · `leadingIcon`/`trailingIcon` · `size`), `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Badge` (`tone`: neutral/info/success/warning/danger · `variant`: subtle/solid/outline), `Alert` (`tone`: info/success/warning/danger · `title`), `Field`, `Input`, `Textarea`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Progress`, `Spinner`, `Skeleton`, `EmptyState`/`ErrorState`/`LoadingState`, `PageHeader`, `toast`. **lucide icons must be imported in the app file**, never via `@ip/ui`.
> - **Query/mutation + errors:** `frontend/apps/candidate/components/dashboard.tsx` (`useMutation` + `errorMessage(err)` + `toast` + `inFlight` latch on submit); `frontend/packages/shared/src/query.ts` (`makeQueryClient` → `retry:false`; `refetchUntil<T>(done, intervalMs=2500)`); `errorMessage`/`isCode`/`HttpError` from `@ip/shared`.
> - **Auth wiring:** `frontend/apps/candidate/lib/auth.tsx` — `export const interview = makeInterviewClient(AIAGENTS_URL, store);` (`AIAGENTS_URL = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081"`). `useAuth()` → `{ api, token, ready, identity }`; `useRequireAuth(token, ready, "/login")`, `useRequireRole(role, ["candidate"], ready)`.

**Files:**
- Create: `frontend/packages/shared/src/practice.ts` (the REST client + types) + export in `index.ts`
- Create: `frontend/apps/candidate/app/practice/types.ts` (re-export the shared types for app-local imports)
- Modify: `frontend/apps/candidate/lib/auth.tsx` (+`export const practice = makePracticeClient(AIAGENTS_URL, store)`)
- Create: `frontend/apps/candidate/app/practice/page.tsx` (route shell: start form ↔ runner + history)
- Create: `frontend/apps/candidate/app/feedback/[id]/page.tsx` (read-only growth panel for a past practice run)
- Create: `frontend/apps/candidate/components/practice-start-form.tsx`, `practice-runner.tsx`, `growth-feedback-panel.tsx`
- Modify: `frontend/apps/candidate/components/candidate-shell.tsx` (+`{ href: "/practice", label: "Practice" }` in `NAV`), `dashboard.tsx` (+a "Practice for an interview" entry card)
- Create: `frontend/packages/shared/src/practice.test.ts` (client method → path/body mapping)

**Query keys:** `["practice-feedback", practiceId]` (the finalizing poll) · `["practice-history"]` (the past-runs list).

---

### Task 1: Shared practice REST client + types (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/packages/shared/src/practice.test.ts` (mirror any existing client test; assert method→path/body mapping against a stubbed `authedFetch`):
```ts
import { describe, it, expect, vi } from "vitest";
import { makePracticeClient } from "./practice.js";

const store = { /* minimal TokenStore stub: get/set/clear */ } as any;

describe("makePracticeClient", () => {
  it("start POSTs /practice/start with the active field only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ practice_id: "p1", question: "Q?" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const c = makePracticeClient("http://x", store);
    const out = await c.start({ topic: "Backend Python" });
    expect(out).toEqual({ practice_id: "p1", question: "Q?" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/practice/start");
    expect(JSON.parse(init.body)).toEqual({ topic: "Backend Python" });
  });
  it("turn POSTs /practice/{id}/turn and feedback GETs /practice/{id}/feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ done: false, question: "Q2?" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = makePracticeClient("http://x", store);
    await c.turn("p1", "ans");
    expect(fetchMock.mock.calls[0][0]).toBe("http://x/practice/p1/turn");
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/shared test practice` → FAIL (`makePracticeClient` not defined). *(If `@ip/shared` has no test runner wired, fold adding `vitest` + a `test` script into this task — but check first; the package likely already tests.)*
- [ ] **Step 3: Implement `frontend/packages/shared/src/practice.ts`** — mirror `interview.ts` exactly (`restAuthFor` + a `post<T>`/`get<T>` pair via `authedFetch`, parsing `{detail}` → `HttpError`). **No `comp_id`/`applicationId` in any signature** (the detached invariant at the client surface):
```ts
import { restAuthFor, type TokenStore } from "./authed-fetch.js";
import { authedFetch } from "./authed-fetch.js";
import { HttpError } from "./errors.js";

export interface GrowthFeedbackView {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggested_topics: string[];
}
export interface PracticeTurn { done: boolean; question: string; }
export interface PracticeFeedbackResult { evaluation_summary: string; feedback: GrowthFeedbackView; }
export interface PracticeSummaryRow { practice_id: string; role_label: string; created_at: string; }

export function makePracticeClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  async function req<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const res = await authedFetch(`${baseUrl}${path}`, init, auth, signal);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new HttpError(res.status, body?.detail ?? `Request failed (${res.status})`, body?.detail);
    }
    return (await res.json().catch(() => {
      throw new HttpError(502, "Malformed response from server");
    })) as T;
  }
  const post = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    req<T>(path, { method: "POST", headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) }, signal);
  const get = <T>(path: string, signal?: AbortSignal) => req<T>(path, { method: "GET" }, signal);

  return {
    // Send only the provided field so the "exactly one" server contract is never violated.
    start: (args: { topic?: string; jd_text?: string }, signal?: AbortSignal) =>
      post<{ practice_id: string; question: string }>("/practice/start", args, signal),
    turn: (practiceId: string, answer: string, signal?: AbortSignal) =>
      post<PracticeTurn>(`/practice/${practiceId}/turn`, { answer }, signal),
    feedback: (practiceId: string, signal?: AbortSignal) =>
      get<PracticeFeedbackResult>(`/practice/${practiceId}/feedback`, signal),
    list: (signal?: AbortSignal) =>
      get<{ sessions: PracticeSummaryRow[] }>("/practice/sessions", signal),
  };
}
```
- [ ] **Step 4: Export from the barrel** — in `frontend/packages/shared/src/index.ts`, next to the `makeInterviewClient` export:
```ts
export {
  makePracticeClient,
  type PracticeTurn,
  type GrowthFeedbackView,
  type PracticeFeedbackResult,
  type PracticeSummaryRow,
} from "./practice.js";
```
- [ ] **Step 5: Run test → PASS** — `npx pnpm@9.15.0 --filter @ip/shared test practice` → PASS; then `npx pnpm@9.15.0 --filter @ip/shared typecheck` → clean (adjust the `TokenStore`/`restAuthFor` import path to the real one in `authed-fetch.js` if typecheck flags it).
- [ ] **Step 6: Commit** — `git add frontend/packages/shared/src/practice.ts frontend/packages/shared/src/index.ts frontend/packages/shared/src/practice.test.ts && git commit -m "feat(practice): detached ai-agents REST client + types (@ip/shared)"`

### Task 2: auth.tsx wiring + app-local types

- [ ] **Step 1:** In `frontend/apps/candidate/lib/auth.tsx`, add the import + the instance directly under the existing `interview` export (reuses the same candidate token store — no second auth surface):
```ts
import { makePracticeClient } from "@ip/shared"; // add to the existing @ip/shared import
// …under: export const interview = makeInterviewClient(AIAGENTS_URL, store);
/** Detached practice REST client (ai-agents) — never carries comp_id/applicationId. */
export const practice = makePracticeClient(AIAGENTS_URL, store);
```
- [ ] **Step 2:** Create `frontend/apps/candidate/app/practice/types.ts` re-exporting the shared types for app-local imports (keeps component imports short + the contract single-sourced):
```ts
export type {
  PracticeTurn,
  GrowthFeedbackView,
  PracticeFeedbackResult,
  PracticeSummaryRow,
} from "@ip/shared";
export interface PracticeStartResult { practice_id: string; question: string; }
```
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(practice): wire practice client into candidate auth"`

### Task 3: `practice-start-form.tsx` (start a mock interview — states: empty / starting / error+retry)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/practice-start-form.tsx`. `"use client"`. Props `{ onStarted(res: PracticeStartResult): void }`. Local `mode: "topic" | "jd"` (a `@ip/ui` `Tabs` or `Select` toggle), `topic`, `jdText`, a `useMutation` for `practice.start`, and the **`inFlight = useRef(false)`** latch (copy the dashboard pattern).
```tsx
"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, Field, Input, Textarea, Button, Alert, Tabs, TabsList, TabsTrigger, TabsContent } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { Sparkles } from "lucide-react";
import { practice } from "../lib/auth";
import type { PracticeStartResult } from "../app/practice/types";

export function PracticeStartForm({ onStarted }: { onStarted: (res: PracticeStartResult) => void }) {
  const [mode, setMode] = useState<"topic" | "jd">("topic");
  const [topic, setTopic] = useState("");
  const [jdText, setJdText] = useState("");
  const inFlight = useRef(false);
  const start = useMutation({
    // Send ONLY the active field — the "exactly one" server contract stays unviolated.
    mutationFn: () => practice.start(mode === "topic" ? { topic: topic.trim() } : { jd_text: jdText.trim() }),
    onSuccess: (res) => onStarted(res),
    onSettled: () => { inFlight.current = false; },
  });
  const ready = mode === "topic" ? topic.trim().length > 0 : jdText.trim().length > 0;
  function submit() {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    start.mutate();
  }
  return (
    <Card>
      <CardHeader><CardTitle>Practice interview</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="info" title="Private to you">
          Practice is just for you — it&apos;s never shared with any employer or recruiter.
        </Alert>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "topic" | "jd")}>
          <TabsList aria-label="Practice source">
            <TabsTrigger value="topic">By topic</TabsTrigger>
            <TabsTrigger value="jd">Paste a JD</TabsTrigger>
          </TabsList>
          <TabsContent value="topic">
            <Field label="Role or topic" hint="e.g. Senior Backend Engineer — Python">
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Senior Backend Engineer" />
            </Field>
          </TabsContent>
          <TabsContent value="jd">
            <Field label="Paste a job description">
              <Textarea rows={8} value={jdText} onChange={(e) => setJdText(e.target.value)} />
            </Field>
          </TabsContent>
        </Tabs>
        {start.isError && (
          <Alert tone="danger" title="Couldn’t start">
            {errorMessage(start.error)}
            <Button variant="outline" size="sm" className="mt-2" onClick={submit}>Retry</Button>
          </Alert>
        )}
        <Button leadingIcon={Sparkles} loading={start.isPending} disabled={!ready} onClick={submit}>
          {start.isPending ? "Starting…" : "Start practice"}
        </Button>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean (adjust `Field`'s `label`/`hint` prop names + `Tabs` `value`/`onValueChange` to the real `@ip/ui` API if typecheck flags them).
- [ ] **Step 3: Commit** — `git commit -am "feat(practice): start form (topic/JD, exactly-one, private framing)"`

### Task 4: `practice-runner.tsx` (turn loop + finalizing → feedback; clone the interview page, drop proctoring)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/practice-runner.tsx`. `"use client"`. Props `{ practiceId: string; firstQuestion: string }`. **Clone the `interview/[applicationId]/page.tsx` state machine**, but **omit the proctoring `useEffect`/`startProctoring`/`proctor.send`, the consent checkboxes/localStorage, and the `intro` consent gate** — the runner starts already `active` (it's handed `firstQuestion`). Reuse verbatim: `turns`/`current`/`answer`/`busy`/`error`/`ended`, the `inFlight`/`abortCtrl` refs, `isSessionEnded` (409/410 → terminal `ended`), the `beforeunload` warning while in-loop, the `role="log" aria-live="polite"` transcript, the `role="status" aria-live="polite"` current question, the `⌘/Ctrl+Enter` `onKeyDown`. Add `phase: "active" | "finalizing" | "done"`.
```tsx
"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, Textarea, Button, Alert, Spinner, Progress, ErrorState } from "@ip/ui";
import { errorMessage, HttpError, refetchUntil } from "@ip/shared";
import { practice } from "../lib/auth";
import { GrowthFeedbackPanel } from "./growth-feedback-panel";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);
function isSessionEnded(err: unknown) { return err instanceof HttpError && (err.status === 409 || err.status === 410); }

export function PracticeRunner({ practiceId, firstQuestion }: { practiceId: string; firstQuestion: string }) {
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [current, setCurrent] = useState(firstQuestion);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"active" | "finalizing" | "done">("active");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const inFlight = useRef(false);
  const abortCtrl = useRef<AbortController | null>(null);
  useEffect(() => () => abortCtrl.current?.abort(), []);
  useEffect(() => {
    if (phase !== "active") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  // 409 races the completed-flip on the server — treat it as "still finalizing, poll again".
  const fb = useQuery({
    queryKey: ["practice-feedback", practiceId],
    queryFn: () => practice.feedback(practiceId),
    enabled: phase !== "active",
    retry: (n, err) => err instanceof HttpError && err.status === 409 && n < 12,
    refetchInterval: refetchUntil((d) => d !== undefined, 2500),
  });

  async function send() {
    const text = answer.trim();
    if (inFlight.current || !text || phase !== "active") return;
    inFlight.current = true; setError(null);
    abortCtrl.current = new AbortController();
    try {
      const res = await practice.turn(practiceId, text, abortCtrl.current.signal);
      setTurns((t) => [...t, { question: current, answer: text }]);
      setAnswer("");
      if (res.done) setPhase("finalizing");
      else setCurrent(res.question);
    } catch (err) {
      if (isSessionEnded(err)) setEnded(true);
      else setError(errorMessage(err));
    } finally { inFlight.current = false; }
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  }

  if (ended) return (
    <Alert tone="warning" title="This practice session has ended">
      Start a fresh one from the <a href="/practice" className="underline">practice page</a>.
    </Alert>
  );
  if (phase !== "active") {
    if (fb.data) return <GrowthFeedbackPanel result={fb.data} />;
    if (fb.isError && !(fb.error instanceof HttpError && fb.error.status === 409))
      return <ErrorState message={errorMessage(fb.error)} retry={() => fb.refetch()} />;
    return (
      <Card><CardContent className="flex items-center gap-3 py-8">
        <Spinner /><span>Scoring your practice interview…</span>
        <Progress className="ml-auto w-32" />
      </CardContent></Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="log" aria-live="polite" className="flex flex-col gap-6">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="rounded-lg bg-surface-muted px-4 py-3 text-sm text-foreground">{t.question}</div>
            <div className="ml-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground sm:ml-8">{t.answer}</div>
          </div>
        ))}
      </div>
      <p className="font-display font-semibold text-foreground" role="status" aria-live="polite">{current}</p>
      {error && <Alert tone="danger">{error}<Button variant="outline" size="sm" className="mt-2" onClick={() => void send()}>Retry</Button></Alert>}
      <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={onKeyDown}
        placeholder={`Type your answer… (${isMac ? "⌘" : "Ctrl"}+Enter to send)`} rows={4} />
      <Button onClick={() => void send()} disabled={!answer.trim()} className="self-end">Send</Button>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean (confirm `refetchUntil` is exported from `@ip/shared` — it is, from `query.ts`; adjust `Progress` props if flagged).
- [ ] **Step 3: Commit** — `git commit -am "feat(practice): runner (turn loop + finalizing poll + feedback), no proctoring"`

### Task 5: `growth-feedback-panel.tsx` (render `GrowthFeedback` — NO verdict)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/growth-feedback-panel.tsx`. `"use client"`. Props `{ result: PracticeFeedbackResult }`. Renders **only** growth content — **no hire/reject/pass-fail, no numeric score, no `recommendation`** anywhere (the server already strips it; this is the visual guarantee). All lucide icons imported **in this file**.
```tsx
"use client";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@ip/ui";
import { CheckCircle2, TrendingUp } from "lucide-react";
import type { PracticeFeedbackResult } from "../app/practice/types";

export function GrowthFeedbackPanel({ result }: { result: PracticeFeedbackResult }) {
  const { feedback, evaluation_summary } = result;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Your growth feedback</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-foreground">{feedback.summary}</p>
          {evaluation_summary && <p className="text-sm text-muted-foreground">{evaluation_summary}</p>}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {feedback.strengths.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" aria-hidden />Strengths</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {feedback.strengths.map((s, i) => <li key={i} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /><span>{s}</span></li>)}
              </ul>
            </CardContent>
          </Card>
        )}
        {feedback.gaps.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4" aria-hidden />Areas to grow</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {feedback.gaps.map((g, i) => <li key={i} className="flex items-start gap-2">
                  <Badge tone="info" variant="subtle">{i + 1}</Badge><span>{g}</span></li>)}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      {feedback.suggested_topics.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Topics to study next</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {feedback.suggested_topics.map((t) => <Badge key={t} tone="info" variant="subtle">{t}</Badge>)}
          </CardContent>
        </Card>
      )}
      <div className="flex gap-3">
        <a href="/practice"><span className="text-sm font-medium text-primary underline">Practice again</span></a>
        <a href="/"><span className="text-sm text-muted-foreground underline">Back to dashboard</span></a>
      </div>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(practice): growth feedback panel (strengths/gaps/topics, no verdict)"`

### Task 6: `app/practice/page.tsx` (route shell + history) + nav + dashboard entry

- [ ] **Step 1:** Create `frontend/apps/candidate/app/practice/page.tsx`. `"use client"`, `useRequireAuth(token, ready)` + `useRequireRole(identity?.role, ["candidate"], ready)` like `app/page.tsx`; wrap in `<CandidateShell>`. Local `started: PracticeStartResult | null`. Render `<PracticeStartForm onStarted={setStarted} />` when `null`, else `<PracticeRunner ... />` + a "Start another" button resetting `started`. Below, a `usePracticeHistory` query (`["practice-history"]` → `practice.list()`) rendering past runs (`role_label` + `created_at`) with `LoadingState`/`EmptyState`/`ErrorState`; each row links to `/feedback/{practice_id}`.
```tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useRequireAuth, useRequireRole } from "../../lib/auth";
import { CandidateShell } from "../../components/candidate-shell";
import { PageHeader, Card, CardContent, Button, EmptyState, LoadingState, ErrorState } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { practice } from "../../lib/auth";
import { PracticeStartForm } from "../../components/practice-start-form";
import { PracticeRunner } from "../../components/practice-runner";
import type { PracticeStartResult } from "./types";

export default function PracticePage() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready, "/login");
  useRequireRole(identity?.role, ["candidate"], ready);
  const [started, setStarted] = useState<PracticeStartResult | null>(null);
  const history = useQuery({ queryKey: ["practice-history"], queryFn: () => practice.list() });
  if (!token) return null;
  return (
    <CandidateShell>
      <PageHeader title="Practice" />
      {started
        ? <><PracticeRunner practiceId={started.practice_id} firstQuestion={started.question} />
            <Button variant="ghost" className="mt-4" onClick={() => setStarted(null)}>Start another</Button></>
        : <PracticeStartForm onStarted={setStarted} />}
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg font-semibold">Past practice runs</h2>
        {history.isLoading && <LoadingState />}
        {history.isError && <ErrorState message={errorMessage(history.error)} retry={() => history.refetch()} />}
        {history.data?.sessions.length === 0 && <EmptyState title="No practice runs yet" description="Start one above to build your skill profile." />}
        <div className="flex flex-col gap-2">
          {history.data?.sessions.map((r) => (
            <a key={r.practice_id} href={`/feedback/${r.practice_id}`}>
              <Card className="hover:border-border-strong"><CardContent className="flex items-center justify-between py-3">
                <span className="font-medium">{r.role_label}</span>
                <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              </CardContent></Card>
            </a>
          ))}
        </div>
      </section>
    </CandidateShell>
  );
}
```
- [ ] **Step 2: Nav + dashboard entry** — add `{ href: "/practice", label: "Practice" }` to `candidate-shell.tsx`'s `NAV`; add a small "Practice for an interview" `Card` (a `Sparkles`/`Dumbbell` lucide icon imported in-file + a `Link` to `/practice`, framed private/no-pressure) to `dashboard.tsx`.
- [ ] **Step 3: Verify build + preview** — `npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop (do **not** `next build` while `pnpm dev` is live): start dev, `/practice` → pick a topic → run a text practice to `done` → the `finalizing` state resolves into `GrowthFeedbackPanel` with strengths/gaps/topics and **no verdict**; the new run appears in "Past practice runs". Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(practice): /practice route shell + history + nav + dashboard entry"`

### Task 7: `app/feedback/[id]/page.tsx` (read-only growth panel for a past practice run)

- [ ] **Step 1:** Create `frontend/apps/candidate/app/feedback/[id]/page.tsx`. `"use client"`, `useRequireAuth` + `useRequireRole(["candidate"])`, wrapped in `<CandidateShell>`, `PageHeader` "Practice feedback". Read `useParams<{ id: string }>()` (the `practice_id`); `useQuery(["practice-feedback", id] → practice.feedback(id))` and render `<GrowthFeedbackPanel result={data} />`. States: `LoadingState`; a `409`-while-finalizing → a "still finalizing" `Card` + auto-poll (reuse the runner's 409-retry); `ErrorState` + retry.
```tsx
"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useRequireAuth, useRequireRole } from "../../../lib/auth";
import { CandidateShell } from "../../../components/candidate-shell";
import { PageHeader, LoadingState, ErrorState } from "@ip/ui";
import { errorMessage, HttpError, refetchUntil } from "@ip/shared";
import { practice } from "../../../lib/auth";
import { GrowthFeedbackPanel } from "../../../components/growth-feedback-panel";

export default function FeedbackPage() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready, "/login");
  useRequireRole(identity?.role, ["candidate"], ready);
  const { id } = useParams<{ id: string }>();
  const fb = useQuery({
    queryKey: ["practice-feedback", id],
    queryFn: () => practice.feedback(id),
    retry: (n, err) => err instanceof HttpError && err.status === 409 && n < 12,
    refetchInterval: refetchUntil((d) => d !== undefined, 2500),
  });
  if (!token) return null;
  return (
    <CandidateShell>
      <PageHeader title="Practice feedback" />
      {fb.isLoading && <LoadingState />}
      {fb.isError && !(fb.error instanceof HttpError && fb.error.status === 409) &&
        <ErrorState message={errorMessage(fb.error)} retry={() => fb.refetch()} />}
      {fb.data && <GrowthFeedbackPanel result={fb.data} />}
    </CandidateShell>
  );
}
```
> **Never-mid-funnel note:** this page renders **practice** feedback (a `practice_id`), which is *always* allowed (detached, no funnel). The **real-application** feedback surface is a **separate** page (`app/feedback/[applicationId]/page.tsx`, pillar Step 6b) keyed by an application id, terminal-state-gated, reading `GET /application/{id}/feedback` off the existing comp-scoped client — **do not** route real-application feedback through `makePracticeClient`. If both surfaces coexist, name the routes distinctly (`/feedback/[id]` = practice; the app-feedback page lives behind a `TERMINAL.has(state)` gate). Add a code comment citing the never-mid-funnel rule at any application-feedback gate.
- [ ] **Step 2: Verify build + preview** — `npx pnpm@9.15.0 --filter @ip/candidate build` clean; preview: from "Past practice runs" click a row → the read-only panel renders. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(practice): /feedback/[id] read-only growth panel"`

### Task 8: Final verify

- [ ] **Step 1:** `npx pnpm@9.15.0 --filter @ip/candidate build` green; `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck` green.
- [ ] **Step 2:** Responsive + dark sanity (token-driven, no hard-coded colors): start form, runner, feedback panel read correctly at mobile width + dark theme. Confirm the **detached invariant at the FE surface**: grep `makePracticeClient` usages — no `comp_id`/`applicationId` passed anywhere.
- [ ] **Step 3: Commit** — `git commit -am "chore(practice): verify build + typecheck green"`

---

## C. States & acceptance

- **States (every surface):** loading (`LoadingState`/`Spinner`/`Skeleton`), empty (`EmptyState` — "No practice runs yet"), error (`Alert tone="danger"`/`ErrorState` + Retry, input preserved), success. The runner adds **finalizing** (Spinner + indeterminate `Progress`, 409-poll until the summary lands) and **ended** (409/410 on a turn → terminal `Alert tone="warning"` + link to start anew, no resume).
- **Detached invariant (the whole point):** the client + all component props carry **no `comp_id`/`job_id`/`applicationId`**; practice never reaches the funnel and is never shown to employers. The growth panel renders **no hire/reject verdict, no numeric score, no `recommendation`** — the visual guarantee matching the server's stripped `GrowthFeedback`.
- **Exactly-one-source:** the start form sends only the active field (`topic` xor `jd_text`); the Start button is disabled until the active field is non-empty after `trim()` — the UI guard is the second layer, the server boundary check stays authoritative.
- **Responsive:** start form + runner stack on mobile; the strengths/gaps pair is `sm:grid-cols-2`. **Dark mode:** tokens only — automatic.
- **A11y:** `Field` wires `<Label htmlFor>`; the mode toggle has an `aria-label`; the transcript is `role="log" aria-live="polite"`; the current question is `role="status" aria-live="polite"`; errors are inline `Alert`s (not vanishing toasts); decorative lucide icons are `aria-hidden`; lists are semantic `<ul>/<li>`.
- **Acceptance:** matches the `aptura_practice_and_growth` mockup; a full topic→run→`done`→growth-feedback flow works against the mock today and against `/practice/*` once the ai-agents endpoints land (no component change — only the client binding); `--filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck` green; the real text-interview page is **unchanged** (regression baseline).
