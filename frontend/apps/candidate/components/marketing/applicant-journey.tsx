"use client";

import { ApIcon } from "@ip/ui";

const ACTS = [
  {
    step: "Step 01",
    n: "1.0",
    title: "Browse roles you fit",
    body: "Search a verified marketplace of open roles. Save what's interesting, set alerts for what matches, every applicant gets the same view.",
    bullets: ["Open marketplace, no paywall", "Save jobs, set alerts", "Same criteria as everyone else"],
  },
  {
    step: "Step 02",
    n: "2.0",
    title: "Apply once",
    body: "One profile, every role. Your résumé, your skills, your preferences — submit to any open role with one tap.",
    bullets: ["One profile, every role", "ID verified once, reused", "Track every application in one place"],
  },
  {
    step: "Step 03",
    n: "3.0",
    title: "Practice for free",
    body: "Sit a full practice round before any real interview. Same UI, same rubric, no scoring against you. Practice is detached from the funnel — nothing here reaches a recruiter.",
    bullets: ["Same UI as the real interview", "No scoring against you", "Growth feedback after"],
  },
  {
    step: "Step 04",
    n: "4.0",
    title: "Sit one proctored interview",
    body: "Live video and voice with Iris, our AI interviewer. Fullscreen-locked. Camera and mic stay on by design. Same standard for every applicant.",
    bullets: ["~20 minutes; you'll see the duration upfront", "On-device detection only — no raw media leaves your browser", "Accommodations are first-class"],
  },
  {
    step: "Step 05",
    n: "5.0",
    title: "Get a real answer + the report behind it",
    body: "Every applicant — advanced or not — receives an outcome with a competency-level note, the recommendation reason, and an option to request a re-score for a different role.",
    bullets: ["A named human reviewer signs every outcome", "You see the evidence behind the decision", "Re-score for new roles, same evidence"],
  },
];

export function ApplicantJourney() {
  return (
    <section className="border-t border-line py-16 lg:py-24" id="journey">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3 lg:mb-12">
          <span className="text-[0.92rem] font-semibold text-coral">— Your journey</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Apply once. Sit one fair interview. Always hear back.
          </h2>
          <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
            Five steps from the moment you find a role to the moment a hiring team decides.
            Every step is observable. Every step is the same for every applicant.
          </p>
        </div>
        <div className="grid gap-5">
          {ACTS.map((act) => (
            <article
              key={act.n}
              className="grid gap-5 rounded-3xl border border-line bg-surface p-6 lg:grid-cols-[90px_1fr_1.2fr] lg:gap-7 lg:p-7"
            >
              <div>
                <span className="block font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
                  {act.step}
                </span>
                <span
                  className="block text-[1.6rem] font-bold tracking-[-0.02em] text-coral"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {act.n}
                </span>
              </div>
              <div>
                <h3
                  className="mb-2 text-[clamp(1.4rem,1.05rem+1.2vw,1.75rem)] font-semibold leading-[1.12] tracking-[-0.022em] text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {act.title}
                </h3>
                <p className="max-w-[42ch] text-[0.96rem] leading-relaxed text-ink-2">
                  {act.body}
                </p>
              </div>
              <div className="flex min-h-[120px] flex-col justify-center rounded-2xl border border-dashed border-line-2 bg-surface-2 p-4">
                <ul className="grid gap-1.5">
                  {act.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-[0.92rem] text-ink-2">
                      <ApIcon name="check" className="mt-[3px] size-[15px] shrink-0 text-coral" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
