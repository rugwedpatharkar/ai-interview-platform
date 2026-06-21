"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function PracticeSpotlight() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-7 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-12">
          <div>
            <span className="text-[0.92rem] font-semibold text-coral">— Practice mode</span>
            <h2
              className="mt-2 text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sit a full practice round.
              <br />
              <span className="text-coral">Free. No scoring.</span>
            </h2>
            <p className="mt-5 text-[var(--step-1)] leading-relaxed text-ink-2">
              The same UI as the real interview. The same rubric. Growth feedback
              after — strengths, gaps, suggested topics. Detached from the funnel; nothing
              here reaches a recruiter.
            </p>
            <ul className="mt-6 grid gap-2.5 text-[0.96rem] text-ink-2">
              {[
                "Same interviewer (Iris), same question style, same proctoring",
                "Growth feedback only — no hire/reject verdict, ever",
                "Take it as many times as you want, on any topic",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <ApIcon name="check" className="mt-[3px] size-[18px] shrink-0 text-coral" />
                  {b}
                </li>
              ))}
            </ul>
            <Link href="/practice" className="ap-btn ap-btn-coral ap-btn-lg mt-7 inline-flex">
              Try a practice round
            </Link>
          </div>
          <div className="rounded-2xl border border-dashed border-line-2 bg-surface-2 p-6 text-center text-[0.94rem] text-ink-3">
            Practice runs on the same surface as the real interview — sample preview
            available after sign-in.
          </div>
        </div>
      </div>
    </section>
  );
}
