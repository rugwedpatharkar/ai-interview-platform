"use client";

import Link from "next/link";

export function ApplicantFinalCta() {
  return (
    <section className="pb-12 pt-16 lg:pb-16">
      <div className="ap-wrap">
        <div
          className="grid gap-6 rounded-[28px] border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--coral) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span
            className="text-[0.92rem] font-semibold text-coral"
            style={{ letterSpacing: "-0.005em" }}
          >
            For applicants
          </span>
          <h3
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-semibold leading-[1.06] tracking-[-0.022em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Get seen. Get interviewed. Get hired.
          </h3>
          <p className="max-w-[60ch] text-ink-2">
            One fair, proctored interview — and a real answer every time. Practice for
            free; sit the real round when you&apos;re ready.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/jobs" className="ap-btn ap-btn-coral ap-btn-lg">
              Find roles
            </Link>
            <Link
              href="/hiring-teams"
              className="text-[0.94rem] font-semibold text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
            >
              Hiring instead? See Aptura for hiring teams →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
