"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

const COMMITMENTS = [
  {
    title: "Extended time",
    body: "Up to 1.5× or 2× the standard interview duration, depending on documented need. Same rubric, same evidence, longer window.",
  },
  {
    title: "Captions for the AI interviewer",
    body: "Live captions are on by default; you can toggle them off if they aren't helpful.",
  },
  {
    title: "Screen-reader-friendly question delivery",
    body: "Questions appear as text in addition to being spoken. Skip-to-text shortcuts available.",
  },
  {
    title: "Alternative response modes",
    body: "If voice response is not possible, written answers in a structured editor are accepted, with the same rubric applied.",
  },
];

export function Accommodations() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3">
          <span className="text-[0.92rem] font-semibold text-coral">— First-class, not a checkbox</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Accommodations don&apos;t affect your score, don&apos;t appear in your report.
          </h2>
          <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
            The proctored interview is high-stakes. The accommodations below are honored on
            request and apply the same rubric — they shape how you sit the interview, not
            how it&apos;s scored.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {COMMITMENTS.map((c) => (
            <article key={c.title} className="ap-cell">
              <h3
                className="text-[1.06rem] font-semibold text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {c.title}
              </h3>
              <p className="mt-1.5 text-[0.94rem] leading-relaxed text-ink-2">{c.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-[0.92rem] text-ink-2">
          Full statement, and how to request an accommodation:{" "}
          <Link
            href="/accessibility"
            className="font-semibold text-coral underline-offset-2 hover:underline"
          >
            Accessibility
            <ApIcon name="arrow" className="ml-1 inline size-3" />
          </Link>
        </p>
      </div>
    </section>
  );
}
