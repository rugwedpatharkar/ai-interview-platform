import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "Accessibility — Aptura",
  description:
    "Aptura's accessibility commitment, target standards (WCAG 2.2 AA), accommodations, and how to request support.",
};

export default function AccessibilityPage() {
  return (
    <MarketingShell audience="applicants">
      <section className="py-16 lg:py-24">
        <div className="ap-wrap">
          <span className="ap-eyebrow">Accessibility</span>
          <h1
            className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Hiring on merit means every candidate can{" "}
            <span className="text-brand">actually take the interview.</span>
          </h1>
          <p className="ap-lead mt-5 max-w-[60ch]">
            Aptura&apos;s accessibility commitment, target standards, and accommodations. If
            something on this page does not work for you, write to{" "}
            <a className="text-brand-strong underline-offset-2 hover:underline" href="mailto:access@aptura.app">access@aptura.app</a>{" "}
            and we will respond within two business days.
          </p>
        </div>
      </section>

      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">Standards we target</span>
            <h2 className="ap-h2 mt-2">WCAG 2.2 AA across every Aptura surface.</h2>
            <p className="ap-lead mt-3">
              Pre-launch posture: this is our design target, not a certification. The audit ships
              with public launch.
            </p>
          </div>
          <ul className="ap-def-list ap-def-list--privacy grid lg:grid-cols-2">
            {[
              ["Color contrast ≥ 4.5:1 for body text", "And ≥ 3:1 for large text or bold ≥14px. Placeholder, muted, and helper text all meet the same body-text threshold."],
              ["Keyboard navigation across every surface", "Every interactive element is reachable, focusable, and operable with a keyboard. No mouse-only paths. Skip-to-content link on every page."],
              ["Visible focus rings everywhere", "Teal 2px outline + 4px halo on every focusable element. Never hidden, never invisible."],
              ["Semantic landmarks and headings", "<header>, <nav>, <main>, <section>, <article>, <footer> used semantically. One <h1> per page. Heading order preserved."],
              ["Screen-reader paths for every surface", "Aria-labels on icon-only buttons, role=group on toggles, role=log for live captions, aria-live polite for async updates."],
              ["Touch targets ≥ 44 × 44 px", "Apple HIG minimum. Material is ≥ 48 × 48. Enforced on buttons, pills, summary handles, timeline pips, calendar slots."],
              ["Reduced motion honored", "Every animation has a prefers-reduced-motion no-op. The status-dot pulse stops. Reveal animations crossfade or are instant."],
              ["No information in colour alone", "Severity badges carry an icon AND a label. Pills carry a textual tone, not just colour. Charts have on-mark labels."],
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

      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">Accommodations for the proctored interview</span>
            <h2 className="ap-h2 mt-2">First-class. Not a checkbox.</h2>
            <p className="ap-lead mt-3">
              The proctored interview is a high-stakes surface. The accommodations below do not
              affect your score, do not appear in your report, and are honored on request.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              ["Extended time", "Up to 1.5× or 2× the standard interview duration, depending on documented need. Same rubric, same evidence, longer window."],
              ["Captions for the AI interviewer", "Live captions are on by default; you can toggle them off if they aren't helpful."],
              ["Screen-reader-friendly question delivery", "Questions appear as text in addition to being spoken. Skip-to-text shortcuts available."],
              ["Alternative response modes", "If voice response is not possible, written answers in a structured editor are accepted, with the same rubric applied."],
              ["Quiet-environment confirmation", "If your environment can't be silent (e.g., service animal, caregiver in home), let us know in advance and the relevant proctoring signals are calibrated."],
              ["Re-scheduling with no penalty", "If you need to pause or re-schedule for a disability-related reason, do so freely. Connection drops are not penalised either."],
            ].map(([t, b]) => (
              <article key={t} className="ap-cell">
                <h3 className="ap-h4">{t}</h3>
                <p className="mt-1.5 text-[0.94rem] leading-relaxed text-ink-2">{b}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

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
              <h2 className="ap-h2">Need an accommodation? Tell us early.</h2>
              <p className="ap-lead mt-3">
                Two business days is our response SLA on accommodation requests. We will confirm
                what we&apos;ll set up and when, in writing.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a className="ap-btn ap-btn-primary ap-btn-lg" href="mailto:access@aptura.app">
                Email access@aptura.app
              </a>
              <Link href="/trust" className="ap-btn ap-btn-ghost ap-btn-lg">
                Trust Architecture
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
