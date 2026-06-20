"use client";

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireAuth, useRequireRole } from "@ip/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { PracticeRunner } from "../../components/practice-runner";
import { PracticeStartForm } from "../../components/practice-start-form";
import { practiceClient } from "../../lib/practice-client";
import { useAuth } from "../../lib/auth";
import type { PracticeStartResult } from "./types";

/** Candidate practice mode: start a detached mock interview (topic or JD), run the turn loop, see
 *  growth feedback, and browse past runs. Fully detached from the funnel — no comp_id/job_id,
 *  never published, never shown to an employer. */
export default function PracticePage() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, ["candidate"], ready);

  const [started, setStarted] = useState<PracticeStartResult | null>(null);

  const history = useAuthedQuery(token, {
    queryKey: ["practice-history"],
    queryFn: () => practiceClient.list(),
  });

  if (!token) return null;
  const sessions = history.data ?? [];

  return (
    <CandidateShell>
      <PageHeader
        title="Practice"
        description="Run a private mock interview and get growth feedback. Nothing here is shared with employers."
      />

      {started ? (
        <div className="flex flex-col gap-4">
          <PracticeRunner
            practiceId={started.practice_id}
            firstQuestion={started.question}
          />
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setStarted(null)}
          >
            Start another
          </Button>
        </div>
      ) : (
        <PracticeStartForm onStarted={setStarted} />
      )}

      <section className="mt-10 flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Past practice runs
        </h2>
        {history.isLoading && <LoadingState />}
        {history.isError && (
          <ErrorState
            message={errorMessage(history.error)}
            retry={() => history.refetch()}
          />
        )}
        {!history.isLoading && !history.isError && sessions.length === 0 && (
          <EmptyState
            title="No practice runs yet"
            description="Start one above to build your skill profile."
          />
        )}
        <div className="flex flex-col gap-2">
          {sessions.map((r) => (
            <Link key={r.practice_id} href={`/feedback/${r.practice_id}`} className="group">
              <Card hoverable>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium text-foreground">{r.role_label}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </CandidateShell>
  );
}
