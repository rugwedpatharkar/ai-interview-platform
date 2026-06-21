"use client";

// Per-application detail. There is no GetMyApplication RPC — the dashboard already lists
// every application the candidate owns, so we reuse that list (cached under the same
// `["applications"]` key) and find the matching row client-side. No extra fetch, and the
// existing 10s in-flight poll keeps state fresh while the user is on this page.

import {
  Alert,
  Badge,
  Button,
  ErrorState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  applicationStatus,
  buttonVariants,
  cn,
} from "@ip/ui";
import {
  TERMINAL_STATES,
  errorMessage,
  useAuthedQuery,
} from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  FileSearch,
  Mail,
  MessageSquare,
  PenSquare,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";

import { CandidateShell } from "../../../components/candidate-shell";
import { MessageThreadView } from "../../../components/message-thread-view";
import { useAuth } from "../../../lib/auth";
import {
  USE_MOCK,
  createMessagesClient,
  listQueryKey,
  makeMockMessagesClient,
} from "../../messages/messages-client";

// Display order of the candidate-journey events. Each event is "done", "current", or
// "pending" based on the application's state. Negative outcomes (rejected / gated_out)
// short-circuit by surfacing a single "Decision" milestone in the negative tone.
type EventTone = "default" | "good" | "bad";
interface JourneyEvent {
  key: string;
  label: string;
  icon: typeof CheckCircle2;
  done: boolean;
  current: boolean;
  tone: EventTone;
}

function buildJourney(state: string): JourneyEvent[] {
  // Map states → milestone index. Anything past the index is "pending"; the index itself is
  // "current" unless terminal. Negative branches collapse the rest of the chain.
  const order = [
    { key: "applied", label: "Applied" },
    { key: "aptitude", label: "Aptitude" },
    { key: "interview", label: "Interview" },
    { key: "scored", label: "Scored" },
    { key: "outcome", label: "Outcome" },
  ];
  const stateIndex: Record<string, number> = {
    applied: 0,
    aptitude_pending: 1,
    gated_out: 1,
    interview_pending: 2,
    interview_in_progress: 2,
    interviewed: 3,
    scored: 3,
    shortlisted: 4,
    hired: 4,
    rejected: 4,
    withdrawn: 0,
    expired: 0,
    abandoned: 0,
  };
  const current = stateIndex[state] ?? 0;
  const negative = ["rejected", "gated_out", "expired", "abandoned"].includes(state);
  const good = state === "shortlisted" || state === "hired";
  return order.map((step, i) => {
    const done = i < current || (i === current && (TERMINAL_STATES.has(state) || state === "gated_out"));
    const isCurrent = i === current && !done;
    const tone: EventTone =
      i === 4 && negative ? "bad" : i === 4 && good ? "good" : "default";
    const icon =
      i === 0
        ? PenSquare
        : i === 1
          ? FileSearch
          : i === 2
            ? Video
            : i === 3
              ? Check
              : Trophy;
    return {
      key: step.key,
      label: step.label,
      icon,
      done,
      current: isCurrent,
      tone,
    };
  });
}

export default function ApplicationDetailPage() {
  const { api, token } = useAuth();
  const { id } = useParams<{ id: string }>();

  // Reuse the dashboard's cached list — no extra RPC. The same 10s in-flight poll keeps
  // this page in sync with the dashboard.
  const applications = useAuthedQuery(token, {
    queryKey: ["applications"],
    queryFn: () => api.applications.listMyApplications({}),
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      return apps.some((a) => !TERMINAL_STATES.has(a.state)) ? 10_000 : false;
    },
  });

  const app = applications.data?.applications.find((a) => a.applicationId === id) ?? null;

  // Messages preview — last 2 messages for this application. Pulls from the same
  // `["messages","threads"]` cache the inbox uses; the 30s poll there keeps it fresh.
  const messagesClient = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient(id, "candidate") : createMessagesClient(api)),
    [api, id],
  );
  const threads = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => messagesClient.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });
  const thread = threads.data?.find((t) => t.applicationId === id) ?? null;

  if (!token) return null;

  if (applications.isLoading) {
    return (
      <CandidateShell>
        <PageHeader title="Application" />
        <Skeleton className="h-64 rounded-2xl" />
      </CandidateShell>
    );
  }

  if (applications.isError) {
    return (
      <CandidateShell>
        <ErrorState
          message={errorMessage(applications.error)}
          retry={() => applications.refetch()}
        />
      </CandidateShell>
    );
  }

  if (!app) {
    return (
      <CandidateShell>
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-12">
          <Alert tone="warning">
            We couldn&rsquo;t find that application. It may have been withdrawn or the link
            is wrong.
          </Alert>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft className="size-4" aria-hidden /> Back to dashboard
          </Link>
        </div>
      </CandidateShell>
    );
  }

  const status = applicationStatus(app.state);
  const journey = buildJourney(app.state);
  const role = thread?.jobTitle ?? `Job ${app.jobId}`;
  const company = thread?.companyName ?? null;
  const reportPublished =
    app.state === "scored" || app.state === "shortlisted" || app.state === "hired" || app.state === "rejected";

  // The thread is sorted desc by lastMessageAt server-side; preview the freshest 2.
  // We don't fetch the full message list here — just the thread row's snippet, which
  // covers "last message preview" without an extra round-trip.
  return (
    <CandidateShell>
      <div className="mb-4">
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden /> Dashboard
        </Link>
      </div>

      {/* Page head */}
      <header className="flex flex-col gap-3 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("ap-pill", pillVariant(app.state))}>
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {status.label}
          </span>
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            App · {app.applicationId.slice(0, 8)}
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {role}
        </h1>
        {company && <p className="text-base text-muted-foreground">{company}</p>}
      </header>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* LEFT — journey timeline */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Timeline</span>
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
            Where you are
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every Aptura application reaches a decision &mdash; here&rsquo;s the current
            picture.
          </p>
          <ol className="mt-5 flex flex-col gap-3">
            {journey.map((ev) => {
              const Icon = ev.icon;
              return (
                <li
                  key={ev.key}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      ev.tone === "good" && "bg-success-surface text-success-foreground",
                      ev.tone === "bad" && "bg-danger-surface text-danger-foreground",
                      ev.tone === "default" && ev.done && "bg-[var(--teal-soft)] text-[var(--teal-strong)]",
                      ev.tone === "default" && ev.current && "bg-[var(--teal)] text-[var(--teal-ink)]",
                      ev.tone === "default" && !ev.done && !ev.current && "bg-surface-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {ev.done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{ev.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {labelForEvent(app.state, ev.key)}
                    </p>
                  </div>
                  {ev.current && !ev.done && (
                    <Circle className="mt-1 size-3 fill-[var(--teal)] text-[var(--teal)]" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>

          {/* Stage CTA — same routes the ApplicationCard uses. */}
          {app.state === "aptitude_pending" && (
            <Link
              href={`/aptitude/${app.applicationId}`}
              className={cn(buttonVariants(), "mt-5 self-start")}
            >
              Take aptitude test
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
          {app.state === "interview_pending" && (
            <Link
              href={`/interview/${app.applicationId}`}
              className={cn(buttonVariants(), "mt-5 self-start")}
            >
              Start interview
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
          {reportPublished && (
            <Link
              href={`/applications/${app.applicationId}/outcome`}
              className={cn(buttonVariants(), "mt-5 self-start")}
            >
              View your outcome
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </section>

        {/* RIGHT — messages preview + scheduled events */}
        <aside className="flex flex-col gap-4">
          <div className="ap-cell">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                <Mail className="size-4 text-primary" aria-hidden /> Messages
              </h3>
              <Link
                href={`/messages/${app.applicationId}`}
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                Open
              </Link>
            </div>
            {threads.isLoading && <Skeleton className="h-16 rounded-md" />}
            {!threads.isLoading && !thread && (
              <p className="text-sm text-muted-foreground">
                No messages yet. When the hiring team writes, you&rsquo;ll see it here.
              </p>
            )}
            {thread && (
              <div className="flex flex-col gap-1">
                <p className="line-clamp-2 text-sm text-foreground">{thread.lastSnippet}</p>
                {thread.unread > 0 && (
                  <Badge tone="info" className="mt-2 self-start">
                    {thread.unread} unread
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="ap-cell">
            <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold text-foreground">
              <Calendar className="size-4 text-primary" aria-hidden /> Scheduled
            </h3>
            {app.state === "interview_pending" || app.state === "interview_in_progress" ? (
              <p className="text-sm text-muted-foreground">
                Your interview is ready when you are &mdash; it&rsquo;s self-scheduled and
                proctored.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled. You&rsquo;ll be invited to the interview once any
                earlier stage is complete.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Tabs — Messages / Events / Report (gated) */}
      <div className="mt-8">
        <Tabs defaultValue="messages">
          <TabsList>
            <TabsTrigger value="messages">
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="size-4" aria-hidden /> Messages
                {thread && thread.unread > 0 && (
                  <Badge tone="info" className="min-w-4 px-1 text-[10px]">
                    {thread.unread > 9 ? "9+" : thread.unread}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="events">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4" aria-hidden /> Events
              </span>
            </TabsTrigger>
            <TabsTrigger value="report" disabled={!reportPublished}>
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-4" aria-hidden /> Report
                {!reportPublished && (
                  <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-muted-foreground">
                    soon
                  </span>
                )}
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="messages">
            <div className="ap-cell p-4">
              <MessageThreadView applicationId={app.applicationId} side="candidate" />
            </div>
          </TabsContent>
          <TabsContent value="events">
            <div className="ap-cell">
              <p className="text-sm text-muted-foreground">
                You&rsquo;ll see calendar events for your interview here once it&rsquo;s
                scheduled.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="report">
            {reportPublished ? (
              <div className="ap-cell flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">
                  Your outcome &mdash; with the evidence we used &mdash; is ready.
                </p>
                <Link
                  href={`/applications/${app.applicationId}/outcome`}
                  className={cn(buttonVariants())}
                >
                  View outcome
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : (
              <div className="ap-cell">
                <p className="text-sm text-muted-foreground">
                  The report unlocks once your interview is reviewed.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CandidateShell>
  );
}

/** Map application state to an .ap-pill modifier so the status pill colour matches the
 * meaning (good/warn/danger/teal/default). Mirrors `applicationStatus().tone`. */
function pillVariant(state: string): string {
  if (state === "shortlisted" || state === "hired") return "ap-pill--good";
  if (state === "rejected" || state === "gated_out") return "ap-pill--danger";
  if (state === "expired" || state === "abandoned" || state === "withdrawn") return "";
  return "ap-pill--teal";
}

/** Human-readable per-event helper text. Keep these short — the icon + label do the
 * heavy lifting, this is the "what does this mean for me right now" line. */
function labelForEvent(state: string, key: string): string {
  if (key === "applied") return "Submitted — reviewers see it.";
  if (key === "aptitude") {
    if (state === "applied") return "Up next — we'll invite you when ready.";
    if (state === "aptitude_pending") return "Ready to take — your turn.";
    if (state === "gated_out") return "Didn't pass the threshold — see your outcome.";
    return "Completed.";
  }
  if (key === "interview") {
    if (state === "applied" || state === "aptitude_pending") return "Unlocks after the aptitude step.";
    if (state === "interview_pending") return "Ready when you are — proctored.";
    if (state === "interview_in_progress") return "In progress — resume to finish.";
    return "Completed.";
  }
  if (key === "scored") {
    if (state === "interviewed") return "Scoring in progress — usually under an hour.";
    if (state === "scored" || state === "shortlisted" || state === "hired" || state === "rejected")
      return "Scored — see the report on your outcome page.";
    return "Pending your interview.";
  }
  // outcome
  if (state === "shortlisted" || state === "hired") return "Recommended to advance.";
  if (state === "rejected") return "The team decided not to advance — see your outcome.";
  if (state === "gated_out") return "Stopped at the aptitude step — see your outcome.";
  if (state === "withdrawn") return "You withdrew this application.";
  if (state === "expired") return "The role closed before a decision.";
  if (state === "abandoned") return "Application abandoned.";
  return "Coming — every Aptura application reaches a decision.";
}
