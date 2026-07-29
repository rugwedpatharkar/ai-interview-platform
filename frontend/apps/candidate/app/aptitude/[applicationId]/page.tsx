"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  Textarea,
  toast,
} from "@ip/ui";
import {
  errorMessage,
  isNotFound,
  isTransient,
  track,
  useRequireAuth,
} from "@ip/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../../lib/auth";
import { CodingSection } from "../../../components/coding-section";
import {
  makeMockAssessmentClient,
  questionsToSections,
  useCodingClient,
  type AssessmentSection,
  type RunResult,
  type SectionAnswer,
} from "../../../lib/assessment";
import { useCountdown } from "../../../lib/use-countdown";

// Cap the "preparing" poll so a never-built bank surfaces a clear message, not a forever
// spinner (the bank is built async from job.published; normally ready within seconds).
const MAX_PREPARE_POLLS = 20; // ~60s at the 3s interval

// Typed-sections + scratch-run live behind a mock until the backend deltas + `pnpm gen` land.
// The live MCQ path is byte-identical: real questions are adapted to `mcq` sections and the
// submit maps back to positional `answers: number[]`.
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const mockClient = makeMockAssessmentClient();

function isAnswered(section: AssessmentSection, a: SectionAnswer | undefined): boolean {
  if (!a) return false;
  if (a.kind === "mcq") return a.option >= 0;
  if (a.kind === "coding") return a.source.trim().length > 0;
  return a.text.trim().length > 0;
}

// One coding section + its own advisory countdown (auto-submits the whole test at zero so the
// candidate isn't stranded). A wrapper component so the countdown hook isn't called in a loop.
function CodingSectionWithTimer({
  section,
  index,
  total,
  source,
  onSource,
  onRun,
  running,
  result,
  error,
  onExpire,
  onAnnounce,
}: {
  section: AssessmentSection;
  index: number;
  total: number;
  source: string;
  onSource: (v: string) => void;
  onRun: () => void;
  running: boolean;
  result?: RunResult;
  error?: string;
  onExpire: () => void;
  onAnnounce?: (label: string) => void;
}) {
  const { display: timeLeft } = useCountdown(section.timeLimitS, onExpire, onAnnounce);
  return (
    <CodingSection
      section={section}
      index={index}
      total={total}
      source={source}
      onSource={onSource}
      onRun={onRun}
      running={running}
      result={result}
      error={error}
      timeLeft={timeLeft ?? undefined}
    />
  );
}

// LocalStorage key for in-progress answers. Bump v1→v2 if the SectionAnswer
// shape changes so a stale draft doesn't crash rehydration.
const PROGRESS_KEY = (applicationId: string) => `aptitude.progress.v1.${applicationId}`;
interface AptitudeDraft {
  answers: Record<string, SectionAnswer>;
  results: Record<string, RunResult>;
}
function readDraft(applicationId: string): AptitudeDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || !parsed) return null;
    const { answers, results } = parsed as AptitudeDraft;
    if (typeof answers !== "object" || typeof results !== "object") return null;
    return { answers, results };
  } catch {
    return null;
  }
}

export default function AptitudePage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();
  const coding = useCodingClient();
  // Rehydrate any draft — this is the whole point of the localStorage mirror:
  // a tab crash / accidental refresh on a one-shot proctored bank must not
  // wipe the candidate's answers.
  const [answers, setAnswers] = useState<Record<string, SectionAnswer>>(
    () => readDraft(applicationId)?.answers ?? {},
  );
  const [results, setResults] = useState<Record<string, RunResult>>(
    () => readDraft(applicationId)?.results ?? {},
  );
  const startTracked = useRef(false);
  const startMs = useRef(Date.now());
  // Screen-reader announcement channel — driven by the timer's threshold hook
  // AND route-level events (submit ok, submit failed).
  const [srAnnouncement, setSrAnnouncement] = useState("");

  const test = useQuery({
    queryKey: ["aptitude", applicationId],
    enabled: Boolean(token),
    retry: false,
    queryFn: async (): Promise<{ sections: AssessmentSection[] }> => {
      if (MOCK) return mockClient.getTest(applicationId);
      const live = await api.aptitude.getAptitudeTest({ applicationId });
      return { sections: questionsToSections(live.questions) };
    },
    // The bank is generated asynchronously — poll while it's "not ready".
    refetchInterval: (query) =>
      query.state.status !== "success" &&
      (isNotFound(query.state.error) || isTransient(query.state.error)) &&
      query.state.fetchFailureCount < MAX_PREPARE_POLLS
        ? 3000
        : false,
  });

  // Fire aptitude.started once per mount — the assessment is a one-shot gated surface.
  useEffect(() => {
    if (startTracked.current) return;
    startTracked.current = true;
    track("aptitude.started", { application_id: applicationId });
  }, [applicationId]);

  // Jump to the top once the test lands — the candidate may have scrolled the "preparing"
  // message while polling, and the test should start from question one.
  useEffect(() => {
    if (test.isSuccess) window.scrollTo(0, 0);
  }, [test.isSuccess]);

  // On completion, move focus to the results heading so keyboard + screen-reader users land
  // on the score instead of being stranded mid-form. (Effect lives below `submit`.)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const sections = test.data?.sections ?? [];
  const hasCoding = sections.some((s) => s.kind === "coding");

  const run = useMutation({
    mutationFn: (s: AssessmentSection) => {
      const a = answers[s.id];
      const source = a?.kind === "coding" ? a.source : s.starterCode ?? "";
      const args = {
        sectionId: s.id,
        language: s.language ?? "python",
        source,
      };
      // Ephemeral execution against visible cases — the live RunCode never grades and never
      // carries hidden test bodies; the mock path stays for offline dev.
      return MOCK
        ? mockClient.run(applicationId, args)
        : coding.runCode(applicationId, args);
    },
    onSuccess: (r, s) => setResults((m) => ({ ...m, [s.id]: r })),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = useMutation({
    mutationFn: () => {
      if (MOCK) {
        const tagged: SectionAnswer[] = sections.map(
          (s) => answers[s.id] ?? defaultAnswer(s),
        );
        return mockClient.submit(applicationId, tagged);
      }
      // Live: route by section shape. Any coding section -> coding.submitCoding grades hidden
      // cases + typed-answer keys (the answer key never crosses the wire — input is trimmed
      // at the client seam). All-MCQ -> the MCQ-only aptitude submit, byte-identical to the
      // pre-typed-sections page (positional option indices keyed by section id).
      if (hasCoding) {
        const codingSection = sections.find((s) => s.kind === "coding");
        const codingAnswer = codingSection
          ? answers[codingSection.id]
          : undefined;
        const source =
          codingAnswer?.kind === "coding"
            ? codingAnswer.source
            : codingSection?.starterCode ?? "";
        const language =
          codingAnswer?.kind === "coding"
            ? codingAnswer.language
            : codingSection?.language ?? "python";
        const typedAnswers = sections
          .filter((s) => s.kind === "free_text")
          .map((s) => {
            const a = answers[s.id];
            return { id: s.id, answer: a?.kind === "free_text" ? a.text : "" };
          });
        return coding.submitCoding(applicationId, { language, source, typedAnswers });
      }
      const ordered = sections.map((s) => {
        const a = answers[s.id];
        return a?.kind === "mcq" ? a.option : -1;
      });
      return api.aptitude.submitAptitude({ applicationId, answers: ordered });
    },
    onSuccess: () => {
      track("aptitude.submitted", {
        application_id: applicationId,
        duration_ms: Date.now() - startMs.current,
      });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  useEffect(() => {
    if (submit.isSuccess) resultHeadingRef.current?.focus();
  }, [submit.isSuccess]);

  // Guard against accidental refresh / tab-close while answers are in-progress
  // but not yet submitted. The aptitude bank is one-shot and gated — losing
  // answers means the candidate cannot retake it.
  const hasAnswers = Object.keys(answers).length > 0;
  useEffect(() => {
    if (!hasAnswers || submit.isSuccess) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Spec requires returnValue to be set for the prompt; the string itself is
      // ignored by every modern browser (they show a generic message instead).
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasAnswers, submit.isSuccess]);

  // Persist in-progress answers/results to localStorage so a tab crash or
  // accidental refresh doesn't wipe them (the bank is one-shot — not
  // recoverable server-side). Debounced by 500ms so a fast typist doesn't
  // hammer localStorage on every keystroke. Cleared on successful submit.
  useEffect(() => {
    if (submit.isSuccess) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          PROGRESS_KEY(applicationId),
          JSON.stringify({ answers, results } satisfies AptitudeDraft),
        );
      } catch {
        // localStorage full / disabled — losing the draft is bad but crashing is worse.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, results, applicationId, submit.isSuccess]);
  useEffect(() => {
    if (!submit.isSuccess) return;
    try {
      window.localStorage.removeItem(PROGRESS_KEY(applicationId));
    } catch {
      /* ignore */
    }
  }, [submit.isSuccess, applicationId]);

  // Global test-level countdown: the largest per-section limit is the whole-
  // test ceiling, since finishing early is fine but running out on any single
  // section auto-submits the entire test. Displayed in the sticky header so a
  // candidate always sees it regardless of scroll position.
  const globalTimeLimit = sections.reduce(
    (max, s) => Math.max(max, s.timeLimitS ?? 0),
    0,
  );
  const { display: globalTimeDisplay, secondsLeft: globalSecondsLeft } = useCountdown(
    globalTimeLimit > 0 ? globalTimeLimit : undefined,
    () => {
      if (!submit.isPending && !submit.isSuccess) submit.mutate();
    },
    (label) => setSrAnnouncement(label),
  );

  if (!token) return null;

  if (submit.isSuccess) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Card>
          <CardHeader>
            <h2
              ref={resultHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-foreground focus:outline-none"
            >
              Result
            </h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {submit.data.score}%
            </p>
            <Alert tone={submit.data.passed ? "success" : "danger"}>
              {submit.data.passed
                ? "You passed — your interview will be unlocked shortly."
                : "You didn't meet the pass threshold for this role."}
            </Alert>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to applications
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const notReady =
    test.isError && (isNotFound(test.error) || isTransient(test.error));
  const preparingStalled = notReady && test.failureCount >= MAX_PREPARE_POLLS;
  const answeredCount = sections.filter((s) => isAnswered(s, answers[s.id])).length;
  const allAnswered = sections.length > 0 && answeredCount === sections.length;
  const isRunning = (s: AssessmentSection) =>
    run.isPending && run.variables?.id === s.id;

  return (
    <main
      className={`mx-auto flex flex-col gap-6 p-6 ${hasCoding ? "max-w-3xl" : "max-w-xl"}`}
    >
      <header className="sticky top-0 z-10 -mx-6 flex flex-col gap-3 border-b border-border/60 bg-background/95 px-6 py-4 backdrop-blur">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Assessment
          </h1>
          {globalTimeDisplay && (
            <span
              role="timer"
              aria-label={`Time remaining: ${globalTimeDisplay}`}
              className={`font-mono text-sm font-semibold tabular-nums ${
                globalSecondsLeft !== null && globalSecondsLeft <= 60
                  ? "text-danger"
                  : "text-foreground"
              }`}
            >
              {globalTimeDisplay}
            </span>
          )}
        </div>
        {sections.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm tabular-nums text-muted-foreground">
              {answeredCount} of {sections.length} answered
            </p>
            <Progress
              value={(answeredCount / sections.length) * 100}
              aria-label={`${answeredCount} of ${sections.length} sections answered`}
            />
          </div>
        )}
      </header>
      {/* AT-only live region — announces "5 minutes remaining" etc as the timer crosses thresholds. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {srAnnouncement}
      </div>

      {test.isLoading && <LoadingState label="Loading your test…" />}

      {notReady && !preparingStalled && (
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Spinner /> Your test is being prepared — this will start automatically.
          </span>
        </Alert>
      )}

      {preparingStalled && (
        <Alert tone="warning">
          <span className="flex flex-col items-start gap-3">
            Your test is taking longer than expected to prepare. Please check back in a few
            minutes, or contact the recruiter if it persists.
            <span className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => test.refetch()}>
                Check again
              </Button>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back to dashboard
              </Link>
            </span>
          </span>
        </Alert>
      )}

      {test.isError && !notReady && (
        <ErrorState message={errorMessage(test.error)} retry={() => test.refetch()} />
      )}

      {test.isSuccess && sections.length === 0 && (
        <EmptyState
          title="No questions yet"
          description="This assessment doesn't have any questions to answer right now. Check your tracker for an update."
        />
      )}

      {sections.map((s, i) => {
        if (s.kind === "coding") {
          const a = answers[s.id];
          const source = a?.kind === "coding" ? a.source : s.starterCode ?? "";
          return (
            <CodingSectionWithTimer
              key={s.id}
              section={s}
              index={i}
              total={sections.length}
              source={source}
              onSource={(v) =>
                setAnswers((m) => ({
                  ...m,
                  [s.id]: {
                    kind: "coding",
                    source: v,
                    language: s.language ?? "python",
                  },
                }))
              }
              onRun={() => run.mutate(s)}
              running={isRunning(s)}
              result={results[s.id]}
              error={
                run.isError && run.variables?.id === s.id
                  ? errorMessage(run.error)
                  : undefined
              }
              onExpire={() => {
                if (!submit.isPending && !submit.isSuccess) submit.mutate();
              }}
            />
          );
        }

        if (s.kind === "free_text") {
          const a = answers[s.id];
          const value = a?.kind === "free_text" ? a.text : "";
          return (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <p className="font-medium text-foreground">
                  <span className="text-muted-foreground">
                    Question {i + 1} of {sections.length}
                  </span>
                  <br />
                  {s.prompt}
                </p>
                <Textarea
                  value={value}
                  onChange={(e) =>
                    setAnswers((m) => ({
                      ...m,
                      [s.id]: { kind: "free_text", text: e.target.value },
                    }))
                  }
                  placeholder="Type your answer…"
                  rows={5}
                  aria-label={`Answer for question ${i + 1}`}
                />
              </CardContent>
            </Card>
          );
        }

        // MCQ — rendered verbatim (regression anchor): the same RadioGroup flow as before.
        const labelId = `aptitude-q-${s.id}`;
        const a = answers[s.id];
        const selected = a?.kind === "mcq" ? a.option : undefined;
        return (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <p id={labelId} className="font-medium text-foreground">
                <span className="text-muted-foreground">
                  Question {i + 1} of {sections.length}
                </span>
                <br />
                {s.prompt}
              </p>
              <RadioGroup
                aria-labelledby={labelId}
                value={selected?.toString()}
                onValueChange={(v) =>
                  setAnswers((m) => ({
                    ...m,
                    [s.id]: { kind: "mcq", option: Number(v) },
                  }))
                }
                className="flex flex-col gap-2"
              >
                {(s.options ?? []).map((opt, oi) => (
                  <label
                    key={oi}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <RadioGroupItem value={oi.toString()} />
                    {opt}
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        );
      })}

      {sections.length > 0 && (
        <Button
          onClick={() => submit.mutate()}
          disabled={!allAnswered || submit.isPending}
          loading={submit.isPending}
          className="self-start"
        >
          {submit.isPending ? "Submitting…" : "Submit answers"}
        </Button>
      )}
    </main>
  );
}

// Default kind-tagged answer for an unanswered section (used only in the mock submit, which
// accepts the full tagged set; the live MCQ submit maps to -1 for unanswered).
function defaultAnswer(s: AssessmentSection): SectionAnswer {
  if (s.kind === "coding")
    return { kind: "coding", source: s.starterCode ?? "", language: s.language ?? "python" };
  if (s.kind === "free_text") return { kind: "free_text", text: "" };
  return { kind: "mcq", option: -1 };
}
