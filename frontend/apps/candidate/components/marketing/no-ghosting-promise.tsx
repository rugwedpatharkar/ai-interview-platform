"use client";

import { ApIcon } from "@ip/ui";

export function NoGhostingPromise() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div
          className="rounded-3xl border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--coral) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span className="text-[0.92rem] font-semibold text-coral">— The promise</span>
          <h2
            className="mt-2 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Every applicant gets a real answer.
            <br />
            <span className="text-coral">With feedback.</span>
          </h2>
          <p className="mt-5 max-w-[60ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            Aptura was built so résumé black holes stop happening. If you sit an Aptura
            interview, you hear back — with a reason, with the evidence behind it, the
            same way for every applicant.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["You'll know", "An outcome message lands. Always."],
              ["With a real reason", "Never silence. Never form-letters."],
              ["The same way for everyone", "Same rubric, same evidence, same review."],
            ].map(([head, sub]) => (
              <div key={head as string} className="rounded-2xl border border-line bg-surface p-4">
                <h4
                  className="text-[1.06rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {head}
                </h4>
                <p className="mt-1.5 text-[0.92rem] leading-snug text-ink-2">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
