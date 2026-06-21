"use client";

import Link from "next/link";

export function HiringTeamsFinalCta() {
  return (
    <section className="pb-12 pt-16 lg:pb-16">
      <div className="ap-wrap">
        <div
          className="grid gap-6 rounded-[28px] border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--teal) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span
            className="text-[0.92rem] font-semibold text-teal-strong"
            style={{ letterSpacing: "-0.005em" }}
          >
            For hiring teams
          </span>
          <h3
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-semibold leading-[1.06] tracking-[-0.022em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Hire on proof. Not pedigree, not polish.
          </h3>
          <p className="max-w-[60ch] text-ink-2">
            Replace résumé screens, take-homes, and ghost rounds with one verified
            interview and one auditable decision.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
              Book a pilot
            </Link>
            <Link
              href="/"
              className="text-[0.94rem] font-semibold text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
            >
              Looking for work? See Aptura for applicants →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
