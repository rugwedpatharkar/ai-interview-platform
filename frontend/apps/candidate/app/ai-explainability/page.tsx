import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "AI Explainability Statement — Aptura",
  description:
    "How Aptura's AI forms recommendations, what evidence it cites, who reviews it, and how it's audited for fairness.",
};

export default function AiExplainabilityPage() {
  return (
    <MarketingShell audience="applicants">
      {/* Hero */}
      <section className="py-16 lg:py-24">
        <div className="ap-wrap">
          <span className="ap-eyebrow">AI Explainability Statement</span>
          <h1
            className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            AI recommends. Humans decide.
            <br />
            <span className="text-brand">Here&apos;s exactly how that works.</span>
          </h1>
          <p className="ap-lead mt-5 max-w-[60ch]">
            Aptura&apos;s AI never decides who gets hired. It produces an evidence-backed
            recommendation that a named human reviews, agrees with or overrides, and signs. This
            page documents the inputs, the model, the evidence, the audit, and the override.
          </p>
        </div>
      </section>

      {/* The pipeline */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">From transcript to recommendation</span>
            <h2 className="ap-h2 mt-2">A single, observable pipeline.</h2>
          </div>
          <ol className="grid gap-4 lg:gap-3">
            {[
              ["Inputs", "The candidate's interview transcript, the role's rubric (Aptura Core 6 by default, or a custom rubric you brought), and the proctoring timeline. No résumé. No demographic data. No social signal."],
              ["Per-competency scoring", "For each rubric competency, the model reads the transcript end-to-end and picks the candidate's strongest evidence (a quoted line and timestamp). It assigns a 1–5 score with that quote attached."],
              ["Recommendation", "Strong, consistent evidence across competencies → Advance. Weak or thin evidence → Hold. The system never produces Reject; a human reviewer decides decline."],
              ["Integrity overlay", "The recommendation is presented alongside the integrity timeline. A HIGH-severity proctoring event auto-ends the session and surfaces as a danger-state on the report; the recruiter sees the clip and the reason."],
              ["Human review", "The hiring manager or recruiter reads the report, can disagree with any score (the evidence is right there), can override the recommendation in one click, and signs the outcome with a reason."],
              ["Audit", "Every decision is logged: the reviewer's name, the evidence shown at decision time, the reason given. Retention is configurable per pilot. The candidate's outcome message names the reviewer's reasoning."],
            ].map(([h, b], i) => (
              <li key={h} className="ap-cell flex flex-col gap-2 lg:grid lg:grid-cols-[90px_1fr] lg:gap-6">
                <span
                  className="text-[1.5rem] font-bold tracking-[-0.02em] text-brand"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="ap-h3">{h}</h3>
                  <p className="ap-lead mt-2 text-[1rem]">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Fairness + audit */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">Fairness, by design</span>
            <h2 className="ap-h2 mt-2">Bias-aware before the audit, audited before launch.</h2>
          </div>
          <ul className="ap-def-list ap-def-list--privacy grid lg:grid-cols-2">
            {[
              ["Rubric-driven, not vibes.", "Every score points to a quoted transcript line. A reviewer can disagree with the rating AND see exactly what informed it."],
              ["Identity is verified once, then ignored by scoring.", "Demographic signal (name, photo, voice, gender, age) is not an input to the scoring model. ID match is a security check, not a scoring feature."],
              ["No protected-class proxies.", "We do not infer ethnicity, gender, age, accent strength, or country-of-origin from face or voice."],
              ["Advisory, never auto-decisive.", "Aptura recommends. A named human signs. We never auto-reject. We never auto-hire."],
              ["Independent audit, scheduled pre-launch.", "A third-party audit under NYC AEDT-144 methodology (or an equivalent) ships before the public launch. The audit report will be linked from this page."],
              ["Re-score on demand.", "New role, new lens — same evidence, recalculated. Candidates can request a re-score with new context after an outcome."],
            ].map(([b, rest]) => (
              <li key={b}>
                <ApIcon name="check" />
                <span>
                  <b>{b}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Override */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="grid overflow-hidden rounded-3xl border border-line lg:grid-cols-2">
            <div className="bg-gradient-to-br from-[color-mix(in_oklch,var(--gold)_8%,var(--surface))] to-surface p-7 lg:p-10 lg:border-r lg:border-line">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-soft text-[color-mix(in_oklch,var(--gold)_50%,var(--ink-deep))]">
                <ApIcon name="bolt" className="size-6" />
              </div>
              <h3 className="ap-h3">What the AI produces</h3>
              <ul className="mt-4 grid gap-2 text-[0.96rem] text-ink-2">
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Score per competency with quoted evidence</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Overall recommendation (Advance / Hold)</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Integrity overlay with severity-stamped events</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Confidence band per score</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />A versioned model + rubric stamp</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-[color-mix(in_oklch,var(--coral)_5%,var(--surface))] to-surface p-7 lg:p-10">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <ApIcon name="user" className="size-6" />
              </div>
              <h3 className="ap-h3">What the human controls</h3>
              <ul className="mt-4 grid gap-2 text-[0.96rem] text-ink-2">
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Agree, override, or send back for re-score</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Capture a written reason — sent to the candidate</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Adjust a single competency score with a comment</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Decide Decline (never automatic)</li>
                <li className="flex gap-2"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Sign the outcome — name + reason logged</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div
            className="grid items-center gap-6 rounded-3xl border border-line p-7 lg:grid-cols-[1.2fr_auto] lg:gap-10 lg:p-12"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--teal) 8%, var(--surface)), var(--surface))",
            }}
          >
            <div>
              <h2 className="ap-h2">Read the architecture, see a sample.</h2>
              <p className="ap-lead mt-3">
                The Trust Architecture page covers the proctoring layers; the sample report shows
                the recommendation a hiring manager actually sees.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/trust" className="ap-btn ap-btn-primary ap-btn-lg">
                Trust Architecture
              </Link>
              <Link href="/sample-report" className="ap-btn ap-btn-ghost ap-btn-lg">
                Sample report
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
