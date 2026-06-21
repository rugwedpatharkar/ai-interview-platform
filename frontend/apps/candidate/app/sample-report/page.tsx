import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "Sample report — Aptura",
  description:
    "What an Aptura evidence report looks like, including the integrity timeline. Sample data — labelled.",
};

export default function SampleReportPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="py-12 lg:py-20">
        <div className="ap-wrap">
          <span className="ap-eyebrow">Sample evidence report</span>
          <h1
            className="mt-3 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            This is what a real Aptura report looks like.
          </h1>
          <p className="ap-lead mt-4 max-w-[60ch]">
            A sample report and integrity timeline. Sample data, labelled. Same primitives every
            recruiter sees on every real interview.
          </p>
        </div>
      </section>

      {/* The report itself */}
      <section className="border-t border-line py-14 lg:py-20">
        <div className="ap-wrap">
          <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)]">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-4 border-b border-line p-6 lg:p-8">
              <div
                className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-coral to-[color-mix(in_oklch,var(--coral)_60%,var(--ink-deep))] font-bold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                SC
              </div>
              <div>
                <div
                  className="text-[1.2rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Sample candidate
                </div>
                <div className="text-[0.86rem] text-ink-3">
                  Sr. Product Designer · sample report · for illustration
                </div>
              </div>
              <span className="ml-auto rounded-full border border-good/40 bg-good/10 px-3 py-1 text-[0.84rem] font-semibold text-good">
                Recommended: Advance
              </span>
            </div>

            {/* Score header */}
            <div className="grid items-center gap-6 border-b border-line p-6 lg:grid-cols-[auto_1fr] lg:p-8">
              <div className="ap-ring" style={{ ["--pct" as string]: 86, width: 88, height: 88 }}>
                <span className="ap-ring-v text-[1.4rem]">86</span>
              </div>
              <div>
                <span className="text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
                  Aptura Score
                </span>
                <div
                  className="mt-1 text-[1.4rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Strong evidence — Top 12% for this role.
                </div>
                <p className="mt-2 max-w-[70ch] text-[0.96rem] leading-relaxed text-ink-2">
                  Candidate demonstrated strong tradeoff reasoning anchored in concrete prior
                  work, clear communication discipline, and consistent rubric coverage. One
                  medium-severity proctoring event surfaced for reviewer attention (see timeline
                  below) — no high-severity events.
                </p>
              </div>
            </div>

            {/* Competencies */}
            <div className="grid gap-3 p-6 lg:p-8">
              <h2
                className="text-[1.2rem] font-semibold text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Aptura Core 6 — competency breakdown
              </h2>
              {[
                { name: "Problem framing", score: "4.2 / 5", pct: 84, quote: 'The brief said "make checkout faster," but the actual constraint was returning users on flaky connections — so we reframed the problem as perceived speed and optimistic UI, not raw latency.', stamp: "Transcript · 00:08:11" },
                { name: "Communication", score: "4.5 / 5", pct: 90, quote: "Let me restate that so I'm sure — you're asking how I'd defend the decision to engineering after we'd already shipped, not before.", stamp: "Transcript · 00:21:02" },
                { name: "Tradeoff reasoning", score: "3.8 / 5", pct: 76, quote: "I'd trade a 200ms performance win for WCAG AA every time on a public-facing flow — the accessibility regression is a permanent cost; the perf win we can claw back at the edge.", stamp: "Transcript · 00:14:38" },
                { name: "Domain knowledge", score: "4.1 / 5", pct: 82, quote: "When we picked Postgres for the audit log, the deciding factor wasn't writes/sec — it was that we could prove the chain of custody with a single SELECT.", stamp: "Transcript · 00:18:22" },
                { name: "Decision quality", score: "4.0 / 5", pct: 80, quote: "Once we had three engineers asking the same clarifying question in week one, I knew the spec was the bug, not them. I rewrote the spec before adding any more code.", stamp: "Transcript · 00:23:47" },
                { name: "Integrity (collaboration)", score: "4.6 / 5", pct: 92, quote: "I shipped the bug-fix that night — but I also wrote the post-mortem the next morning. The post-mortem is what kept us from doing the same thing again two months later.", stamp: "Transcript · 00:26:55" },
              ].map((c) => (
                <article key={c.name} className="rounded-xl border border-line bg-surface-2 p-4 lg:p-5">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-ink-deep">{c.name}</span>
                    <span className="ml-auto font-mono font-semibold text-teal-strong">
                      {c.score}
                    </span>
                  </div>
                  <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-3">
                    <i className="block h-full rounded-full bg-teal" style={{ width: `${c.pct}%` }} />
                  </div>
                  <blockquote className="mt-3 rounded-r-lg border-l-[3px] border-teal bg-surface px-3 py-2.5 text-[0.92rem] leading-relaxed text-ink">
                    <span
                      className="text-[1.4em] leading-none text-teal"
                      style={{ fontFamily: "var(--font-display)" }}
                      aria-hidden
                    >
                      “
                    </span>
                    {c.quote}
                    <span
                      className="text-[1.4em] leading-none text-teal"
                      style={{ fontFamily: "var(--font-display)" }}
                      aria-hidden
                    >
                      ”
                    </span>
                  </blockquote>
                  <span className="mt-2 block font-mono text-[0.74rem] text-ink-3">{c.stamp}</span>
                </article>
              ))}
            </div>

            {/* Integrity timeline */}
            <div className="border-t border-line p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2
                  className="text-[1.2rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Integrity timeline
                </h2>
                <span className="text-[0.86rem] text-ink-3">
                  Sample timeline · 28m 12s · for illustration
                </span>
                <div className="ml-auto flex gap-3 text-[0.78rem] text-ink-2">
                  <LegendDot color="var(--good)" label="Low" />
                  <LegendDot color="var(--warn)" label="Medium" />
                  <LegendDot color="var(--danger)" label="High · auto-end" />
                </div>
              </div>
              <div className="ap-itl-track mt-4" role="img" aria-label="Sample interview integrity timeline">
                <div className="ap-itl-line" />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "6%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "18%" }} />
                <span className="ap-itl-pip ap-itl-pip--m" style={{ left: "32%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "44%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "58%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "71%" }} />
                <span className="ap-itl-pip ap-itl-pip--m" style={{ left: "83%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "95%" }} />
                <span className="ap-itl-scrubber" style={{ left: "32%" }} />
                <div className="ap-itl-axis">
                  <span>00:00</span><span>07:00</span><span>14:00</span><span>21:00</span><span>28:12</span>
                </div>
              </div>
              <div className="ap-itl-events mt-5">
                <Event sev="l" stamp="00:01:42 · LOW" ttl="Background voice (single)" body="One non-candidate voice detected briefly — below the second-voice threshold." clip="Reason · Single short utterance, <2s. Treated as ambient noise. No action." />
                <Event sev="m" expanded stamp="00:09:18 · MEDIUM" ttl="Fullscreen exit (24 seconds)" body="Candidate left fullscreen for 24 seconds and returned. Surfaced to reviewer." clip="Clip · 00:09:14 → 00:09:42 · Reviewer to inspect. No auto-action." />
                <Event sev="l" stamp="00:23:51 · LOW" ttl="Gaze drift to corner" body="Gaze tracked off-frame for 1.8s. Within normal interview range." clip="Reason · Below threshold. No action." />
              </div>
            </div>

            {/* Reviewer footer */}
            <div className="border-t border-line bg-surface-2 p-6 lg:p-8">
              <span className="text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
                Decision
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-full bg-gradient-to-br from-coral to-[color-mix(in_oklch,var(--coral)_60%,var(--ink-deep))]" />
                  <div>
                    <div className="font-semibold text-ink-deep">Sample reviewer</div>
                    <div className="text-[0.78rem] text-ink-3">Hiring Manager · sample workspace</div>
                  </div>
                </div>
                <span className="ml-auto inline-flex items-center gap-2 rounded-md border border-good/40 bg-good/10 px-3 py-1.5 text-[0.86rem] font-semibold text-good">
                  <ApIcon name="check" className="size-4" /> Advance · signed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Note */}
      <section className="py-14 lg:py-20">
        <div className="ap-wrap">
          <div className="grid items-center gap-6 rounded-3xl border border-line bg-surface-2 p-6 lg:grid-cols-[1fr_auto] lg:gap-10 lg:p-10">
            <p className="text-[0.94rem] leading-relaxed text-ink-2">
              <b className="text-ink-deep">Sample data, labelled.</b> Aptura is pre-launch — every
              candidate name, quote, score, and timestamp on this page is for illustration. The UI
              and the primitives (score ring, competency cards, integrity timeline scrubber, event
              cards, reviewer signature) are exactly what every real Aptura report uses.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/pilot" className="ap-btn ap-btn-primary">
                Book a pilot
              </Link>
              <Link href="/trust" className="ap-btn ap-btn-ghost">
                Read the architecture
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Event({
  sev,
  stamp,
  ttl,
  body,
  clip,
  expanded,
}: {
  sev: "l" | "m" | "h";
  stamp: string;
  ttl: string;
  body: string;
  clip: string;
  expanded?: boolean;
}) {
  const dot = { l: "var(--good)", m: "var(--warn)", h: "var(--danger)" }[sev];
  return (
    <article
      className={
        expanded
          ? "rounded-2xl border border-coral bg-surface p-4 shadow-[0_6px_24px_-10px_color-mix(in_oklch,var(--coral)_30%,transparent)]"
          : "rounded-2xl border border-line bg-surface-2 p-4"
      }
    >
      <div className="flex items-center gap-2 font-mono text-[0.78rem] text-ink-3">
        <span className="size-[7px] rounded-full" style={{ background: dot }} />
        <span>{stamp}</span>
      </div>
      <div
        className="mt-1.5 text-[1rem] font-semibold text-ink-deep"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {ttl}
      </div>
      <p className="mt-1 text-[0.86rem] text-ink-2">{body}</p>
      <div className="mt-2.5 rounded-lg border border-dashed border-[color-mix(in_oklch,var(--gold)_35%,var(--line))] bg-[color-mix(in_oklch,var(--gold)_15%,var(--surface))] px-2.5 py-2 text-[0.78rem] text-ink-2">
        {clip}
      </div>
    </article>
  );
}
