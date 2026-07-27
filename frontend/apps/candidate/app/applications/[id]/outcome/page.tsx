"use client";

// The no-ghosting surface. Always shows a verdict, always shows why. Backed by
// `api.reports.getReport` — the existing candidate-readable report RPC. Until the report
// is written this 404s, which we surface as "outcome not published yet" rather than
// the bare error state, so a candidate who lands here mid-scoring sees the right thing.

import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorState,
  Skeleton,
  Textarea,
  buttonVariants,
  cn,
  toast,
} from "@ip/ui";
import {
  errorMessage,
  isNotFound,
  isTransient,
  useAuthedQuery,
} from "@ip/shared";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  MessageSquare,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CandidateShell } from "../../../../components/candidate-shell";
import { useAuth } from "../../../../lib/auth";

// Mirror of the company-side ReportDTO with the fields the candidate view needs. The wire
// shape is wider than what the generated TS type carries today (see company report page);
// the same protobuf-es defaulting applies — null-coerce everything once so the JSX is
// safe even before `pnpm gen` widens the type.
interface OutcomeDTO {
  applicationId: string;
  state: string;
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  overallScore: number; // 0..1
  recommendation: string;
  competencies: {
    competency: string;
    score: number;
    rationale: string;
    evidence: { quote: string; note: string }[];
  }[];
}

function toOutcomeDTO(r: Record<string, unknown>): OutcomeDTO {
  return {
    applicationId: (r.applicationId as string) ?? "",
    state: (r.state as string) ?? "",
    executiveSummary: (r.executiveSummary as string) ?? "",
    highlights: (r.highlights as string[]) ?? [],
    risks: (r.risks as string[]) ?? [],
    overallScore: (r.overallScore as number) ?? 0,
    recommendation: (r.recommendation as string) ?? "",
    competencies:
      (r.competencies as OutcomeDTO["competencies"]) ?? [],
  };
}

type Verdict = "advance" | "hold" | "reject" | "unknown";

function verdictFrom(state: string, rec: string): Verdict {
  // Server can express the decision via either `recommendation` or terminal state. Prefer
  // the recommendation since it's the explicit reviewer signal; fall back to state.
  const r = rec.toLowerCase();
  if (r.includes("advance") || r.includes("hire")) return "advance";
  if (r.includes("hold")) return "hold";
  if (r.includes("reject") || r.includes("decline")) return "reject";
  if (state === "shortlisted" || state === "hired") return "advance";
  if (state === "rejected" || state === "gated_out") return "reject";
  return "unknown";
}

const VERDICT_COPY: Record<Verdict, { label: string; pill: string; lead: string }> = {
  advance: {
    label: "Advanced",
    pill: "ap-pill--good",
    lead: "The team wants to move forward with you.",
  },
  hold: {
    label: "Hold",
    pill: "ap-pill--warn",
    lead: "Not a yes today, but the team isn't closing the door.",
  },
  reject: {
    label: "Declined",
    pill: "ap-pill--danger",
    lead: "The team isn't advancing this application.",
  },
  unknown: {
    label: "Reviewed",
    pill: "",
    lead: "Your interview has been reviewed.",
  },
};

export default function OutcomePage() {
  const { api, token } = useAuth();
  const { id } = useParams<{ id: string }>();

  // Same polling pattern as the company-side report page: while the report is still being
  // generated, retry on 404 / transient. Bail after MAX_POLLS (~5 min at 3s each) so a
  // report that never publishes stops burning battery + logs; the empty state we render
  // below on isError already tells the candidate to check back later.
  const MAX_POLLS = 100;
  const report = useAuthedQuery(token, {
    queryKey: ["report", id],
    retry: false,
    queryFn: () => api.reports.getReport({ applicationId: id }),
    refetchInterval: (query) => {
      if (query.state.status === "success") return false;
      if (query.state.fetchFailureCount >= MAX_POLLS) return false;
      const err = query.state.error;
      return isNotFound(err) || isTransient(err) ? 3000 : false;
    },
  });

  if (!token) return null;

  const notReady = report.isError && isNotFound(report.error);
  const data = report.data ? toOutcomeDTO(report.data as Record<string, unknown>) : null;
  const verdict = data ? verdictFrom(data.state, data.recommendation) : "unknown";
  const copy = VERDICT_COPY[verdict];
  const scorePct = data ? Math.round(data.overallScore * 100) : 0;

  return (
    <CandidateShell>
      <div className="mb-4">
        <Link
          href={`/applications/${id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to application
        </Link>
      </div>

      {report.isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      )}

      {notReady && (
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
          <Alert tone="info">
            <span className="flex items-center gap-2">
              <RefreshCcw className="size-4 animate-[spin_2s_linear_infinite]" aria-hidden />
              Outcome not published yet &mdash; your interview is being reviewed. This page
              updates automatically.
            </span>
          </Alert>
          <p className="text-sm text-muted-foreground">
            We aim to publish every outcome within one business day of the interview. If
            you have questions in the meantime, the hiring team will see your messages.
          </p>
          <Link
            href={`/messages/${id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Mail className="size-4" aria-hidden /> Open messages
          </Link>
        </div>
      )}

      {report.isError && !notReady && (
        <ErrorState
          message={errorMessage(report.error)}
          retry={() => report.refetch()}
        />
      )}

      {data && (
        <article className="flex flex-col gap-6">
          {/* HERO — verdict + score + reviewer recommendation. */}
          <section className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Your outcome</span>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex flex-col items-start gap-3">
                <span className={cn("ap-pill text-base", copy.pill)}>{copy.label}</span>
                <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
                  {copy.lead}
                </h1>
                {data.executiveSummary && (
                  <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
                    {data.executiveSummary}
                  </p>
                )}
              </div>
              <div className="lg:ml-auto">
                {/* Aptura Score ring — same primitive used everywhere else in the report
                    surface. --pct comes from overallScore (already 0..1). */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="ap-ring"
                    style={{
                      ["--pct" as string]: scorePct,
                      width: 96,
                      height: 96,
                    }}
                  >
                    <span className="ap-ring-v text-[1.4rem]">{scorePct}</span>
                  </div>
                  <span className="font-mono text-[0.74rem] uppercase tracking-[0.1em] text-muted-foreground">
                    Aptura Score
                  </span>
                </div>
              </div>
            </div>

            {data.recommendation && (
              <blockquote className="mt-6 rounded-r-lg border-l-[3px] border-[var(--brand)] bg-surface px-4 py-3 text-base leading-relaxed text-foreground">
                <span
                  className="text-[1.4em] leading-none text-[var(--brand)]"
                  style={{ fontFamily: "var(--font-display)" }}
                  aria-hidden
                >
                  &ldquo;
                </span>
                {data.recommendation}
                <span
                  className="text-[1.4em] leading-none text-[var(--brand)]"
                  style={{ fontFamily: "var(--font-display)" }}
                  aria-hidden
                >
                  &rdquo;
                </span>
              </blockquote>
            )}

            {/* Primary CTA — context-dependent. */}
            <div className="mt-6 flex flex-wrap gap-3">
              {/* One tier per element: the other actions on this screen use
                  <Button>, and Tailwind's utilities layer overrode the stacked
                  ap-btn-primary here anyway. */}
              {verdict === "advance" && (
                <Link
                  href={`/applications/${id}`}
                  className={buttonVariants()}
                >
                  <Sparkles className="size-4" aria-hidden /> See next steps
                </Link>
              )}
              {(verdict === "hold" || verdict === "reject") && <RescoreDialog applicationId={id} />}
              <Link
                href={`/messages/${id}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <MessageSquare className="size-4" aria-hidden /> Message the reviewer
              </Link>
            </div>
          </section>

          {/* Competency cards — evidence-first. Each card carries the score, a rationale,
              and the candidate's own words pulled from the transcript. Reuses the visual
              language from the sample report so candidate + reviewer surfaces stay aligned. */}
          {data.competencies.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                How we read the interview
              </h2>
              <p className="text-sm text-muted-foreground">
                Each competency is scored against this role&rsquo;s rubric, and quoted from
                your own answers.
              </p>
              <div className="grid gap-3">
                {data.competencies.map((c) => (
                  <CompetencyCard key={c.competency} c={c} />
                ))}
              </div>
            </section>
          )}

          {/* Highlights + risks — short bullets, two-column at lg. */}
          {(data.highlights.length > 0 || data.risks.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.highlights.length > 0 && (
                <div className="ap-cell">
                  <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                    What stood out
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                    {data.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--good)]" aria-hidden />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.risks.length > 0 && (
                <div className="ap-cell">
                  <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                    Where the team had questions
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                    {data.risks.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--warn)]" aria-hidden />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Reviewer footer — signed accountability. The wire doesn't yet carry a
              reviewer name or signed-at timestamp on the candidate-readable report; until
              it does, we keep the note generic so we don't fabricate identity. */}
          <footer className="rounded-2xl border border-border bg-surface-2 p-5 text-sm text-muted-foreground">
            <p>
              This decision was reviewed and signed by the hiring team. Have a question?
              <Link href={`/messages/${id}`} className="ml-1 underline">
                Reply here
              </Link>{" "}
              and the reviewer will see it.
            </p>
          </footer>
        </article>
      )}
    </CandidateShell>
  );
}

/** One competency card — score, rationale, the candidate's own words. */
function CompetencyCard({
  c,
}: {
  c: OutcomeDTO["competencies"][number];
}) {
  const pct = Math.round((c.score ?? 0) * 100);
  return (
    <article className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-foreground">{c.competency}</span>
        <span className="ml-auto font-mono text-sm font-semibold text-[var(--brand-strong)]">
          {pct} / 100
        </span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[var(--surface-3)]">
        <i className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
      </div>
      {c.rationale && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.rationale}</p>
      )}
      {c.evidence.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {c.evidence.map((e, i) => (
            <blockquote
              key={i}
              className="rounded-r-lg border-l-[3px] border-[var(--brand)] bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground"
            >
              <span
                className="text-[1.2em] leading-none text-[var(--brand)]"
                style={{ fontFamily: "var(--font-display)" }}
                aria-hidden
              >
                &ldquo;
              </span>
              {e.quote}
              <span
                className="text-[1.2em] leading-none text-[var(--brand)]"
                style={{ fontFamily: "var(--font-display)" }}
                aria-hidden
              >
                &rdquo;
              </span>
              {e.note && (
                <span className="mt-1 block font-mono text-[0.74rem] text-muted-foreground">
                  {e.note}
                </span>
              )}
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}

/** Re-score request modal. There's no Rescore RPC yet, so the modal submits the request
 * as a message in the existing thread (the team sees it as a normal reply). This keeps
 * the no-ghosting promise honest without inventing a backend contract. */
function RescoreDialog({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          Request a re-score
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Request a re-score</DialogTitle>
        <DialogDescription>
          Tell the reviewer what you&rsquo;d like them to look at again &mdash; a missed
          example, a question you&rsquo;d answer differently, or a technical issue during
          the call. They&rsquo;ll see this in your messages thread.
        </DialogDescription>
        <Textarea
          className="mt-3"
          rows={5}
          maxLength={1200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. I'd like a second look at competency 'Tradeoff reasoning' — at 00:14:30 I gave a fuller example after the one in the summary."
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={reason.trim().length < 10}
            onClick={async () => {
              // Copy the draft to clipboard then navigate to the messages thread so the
              // candidate can paste and send. We don't auto-send here because the messages
              // client lives in /messages and the optimistic-send + receive-poll pattern
              // shouldn't be duplicated. If the clipboard write fails (insecure origin,
              // permission denied, older browser) surface it so the candidate isn't left
              // wondering why the paste target is empty.
              let copied = true;
              try {
                await navigator.clipboard.writeText(reason.trim());
              } catch {
                copied = false;
                toast.warning("Couldn't copy the draft — retype it in the message thread.");
              }
              setOpen(false);
              router.push(`/messages/${applicationId}`);
              if (copied) toast.success("Draft copied. Paste it into your message thread.");
            }}
          >
            Copy &amp; open messages
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
