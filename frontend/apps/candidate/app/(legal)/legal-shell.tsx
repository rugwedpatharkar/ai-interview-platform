import type { ReactNode } from "react";
import { MarketingShell } from "@ip/ui";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalShell({
  eyebrow,
  title,
  effective,
  sections,
}: {
  eyebrow: string;
  title: string;
  effective: string;
  sections: LegalSection[];
}) {
  return (
    <MarketingShell audience="applicants">
      <section className="py-12 lg:py-20">
        <div className="ap-wrap">
          <span className="ap-eyebrow">{eyebrow}</span>
          <h1
            className="mt-3 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          <p className="mt-4 text-[0.94rem] text-ink-3">Effective {effective}</p>
        </div>
      </section>

      <section className="border-t border-line py-10 lg:py-16">
        <div className="ap-wrap grid items-start gap-10 lg:grid-cols-[240px_1fr] lg:gap-14">
          {/* Sticky TOC */}
          <nav aria-label="Sections" className="lg:sticky lg:top-24">
            <details className="rounded-xl border border-line bg-surface-2 p-4 lg:bg-transparent lg:border-0 lg:p-0">
              <summary
                className="cursor-pointer list-none text-[0.86rem] font-semibold uppercase tracking-[0.12em] text-ink-3 lg:cursor-default"
                style={{ fontFamily: "var(--font-display)" }}
              >
                On this page
              </summary>
              <ol className="mt-3 grid gap-1.5">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block rounded-md px-2 py-1.5 text-[0.92rem] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-deep"
                    >
                      <span className="mr-2 font-mono text-[0.74rem] text-ink-3">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>

          {/* Long-form body */}
          <article className="grid gap-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <div className="flex items-baseline gap-3">
                  <span
                    className="font-mono text-[0.78rem] text-brand"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="ap-h2 text-[clamp(1.4rem,1.1rem+0.8vw,1.8rem)]">{s.title}</h2>
                </div>
                <div className="mt-4 max-w-[68ch] text-[1rem] leading-[1.7] text-ink-2">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}

/** Inline legal-placeholder marker — calls out where ratified legal copy goes. */
export function LegalPlaceholder({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-brand/40 bg-brand-soft/30 p-4 text-[0.92rem] leading-relaxed text-ink-2">
      <b className="text-brand">[LEGAL placeholder]</b>{" "}
      {children ?? "Ratified legal text goes here. The structure on this page is final; the words are filled in by counsel before public launch."}
    </div>
  );
}
