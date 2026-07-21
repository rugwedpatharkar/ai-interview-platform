import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "What Aptura does not do — Aptura",
  description:
    "The constraints we ship with every interview, on day one. The strongest part of a proctored system is what it cannot do.",
};

export default function WhatWeDontDoPage() {
  return (
    <MarketingShell audience="applicants">
      <section className="py-16 lg:py-24">
        <div className="ap-wrap">
          <span className="ap-eyebrow">What Aptura does not do</span>
          <h1
            className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Integrity is knowing who&apos;s at the keyboard.
            <br />
            <span className="text-brand">Not policing what they use.</span>
          </h1>
          <p className="ap-lead mt-5 max-w-[60ch]">
            A new generation of cheating tools advertises &quot;runs invisibly during your
            interview.&quot; We beat that category — without making candidates feel watched. The
            constraints below ship with every interview, on day one. They are not a roadmap.
          </p>
        </div>
      </section>

      {/* The 10 commitments */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">Ten constraints</span>
            <h2 className="ap-h2 mt-2">Everything below is a constraint we chose to enforce.</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              ["No real-time human watcher", "There is no live reviewer sitting on your interview. Detectors run on-device; humans only see flagged events, after the fact."],
              ["No raw video or audio sent to our servers", "Frames stay in the browser. Audio stays in the browser. Detectors reduce them to typed events; only typed events leave."],
              ["No emotion or affect inference", "We don't infer stress, confidence, personality, or mood from face or voice. Ever. Not in scoring, not in reporting, not as advisory."],
              ["No identity matching beyond the ID check", "No voiceprints. No face-match against external databases. ID confirmation is one-shot at the start, then archived."],
              ["No keystroke surveillance for content", "We detect tab-switches and copy/paste events as integrity signals. We do not capture what you type elsewhere."],
              ["No client-side severity grading", "The client cannot say 'this is HIGH.' Severity is assigned server-side. The client cannot escalate or downgrade an event."],
              ["No silent auto-rejection", "Aptura recommends Advance or Hold — never Reject. A named human signs every outcome with a reason."],
              ["No demographic signals as scoring inputs", "Name, photo, voice timbre, accent, gender, age — none of these reach the scoring model."],
              ["No résumé scoring", "The interview transcript is the scoring input. Résumé content does not feed scoring; it only seeds the candidate's profile."],
              ["No silent retention", "Right-to-erase is honored across every Aptura artifact. Recording, transcript, scoring, decision metadata — one request, one cascade."],
            ].map(([title, body], i) => (
              <article key={title} className="ap-cell flex gap-4">
                <span
                  className="text-[1.3rem] font-bold tracking-[-0.02em] text-brand"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="ap-h4">{title}</h3>
                  <p className="mt-1.5 text-[0.94rem] leading-relaxed text-ink-2">{body}</p>
                </div>
              </article>
            ))}
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
                "linear-gradient(135deg, color-mix(in oklch, var(--brand) 8%, var(--surface)), var(--surface))",
            }}
          >
            <div>
              <h2 className="ap-h2">See the architecture that enforces these.</h2>
              <p className="ap-lead mt-3">
                Trust Architecture documents the five layers; the AI Explainability Statement
                covers how recommendations are formed and overridden.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/trust" className="ap-btn ap-btn-primary ap-btn-lg">
                Trust Architecture
              </Link>
              <Link href="/ai-explainability" className="ap-btn ap-btn-ghost ap-btn-lg">
                AI Explainability
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
