"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  toast,
} from "@ip/ui";
import {
  errorMessage,
  isNotFound,
  isTransient,
  useRequireAuth,
} from "@ip/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "../../../lib/auth";

// Cap the "preparing" poll so a never-built bank surfaces a clear message, not a forever
// spinner (the bank is built async from job.published; normally ready within seconds).
const MAX_PREPARE_POLLS = 20; // ~60s at the 3s interval

export default function AptitudePage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const test = useQuery({
    queryKey: ["aptitude", applicationId],
    enabled: Boolean(token),
    retry: false,
    queryFn: () => api.aptitude.getAptitudeTest({ applicationId }),
    // The bank is generated asynchronously — poll while it's "not ready".
    refetchInterval: (query) =>
      query.state.status !== "success" &&
      (isNotFound(query.state.error) || isTransient(query.state.error)) &&
      query.state.fetchFailureCount < MAX_PREPARE_POLLS
        ? 3000
        : false,
  });

  // Jump to the top once the questions land — the candidate may have scrolled the
  // "preparing" message while polling, and the test should start from question one.
  useEffect(() => {
    if (test.isSuccess) window.scrollTo(0, 0);
  }, [test.isSuccess]);

  const submit = useMutation({
    mutationFn: () => {
      const ordered = (test.data?.questions ?? []).map(
        (q) => answers[q.index] ?? -1,
      );
      return api.aptitude.submitAptitude({ applicationId, answers: ordered });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!token) return null;

  if (submit.isSuccess) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="font-display text-3xl font-semibold text-foreground">
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
  const questions = test.data?.questions ?? [];
  const answeredCount = questions.filter(
    (q) => answers[q.index] !== undefined,
  ).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Aptitude test
        </h1>
        {questions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {answeredCount} of {questions.length} answered
            </p>
            <Progress
              value={(answeredCount / questions.length) * 100}
              aria-label={`${answeredCount} of ${questions.length} questions answered`}
            />
          </div>
        )}
      </header>

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
        <ErrorState
          message={errorMessage(test.error)}
          retry={() => test.refetch()}
        />
      )}

      {questions.map((q, i) => {
        const labelId = `aptitude-q-${q.index}`;
        return (
          <Card key={q.index}>
            <CardContent className="flex flex-col gap-3 p-4">
              <p id={labelId} className="font-medium text-foreground">
                <span className="text-muted-foreground">
                  Question {i + 1} of {questions.length}
                </span>
                <br />
                {q.question}
              </p>
              <RadioGroup
                aria-labelledby={labelId}
                value={answers[q.index]?.toString()}
                onValueChange={(v) =>
                  setAnswers((a) => ({ ...a, [q.index]: Number(v) }))
                }
                className="flex flex-col gap-2"
              >
                {q.options.map((opt, oi) => (
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

      {questions.length > 0 && (
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
