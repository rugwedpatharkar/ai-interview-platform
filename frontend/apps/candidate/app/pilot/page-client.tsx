"use client";

import { useState, type FormEvent } from "react";
import { ApIcon, MarketingShell } from "@ip/ui";

/**
 * Pilot-intake form (company side).
 * Submission seam: mailto fallback today; backend `forms.submitPilot` is TBD.
 */
export function PilotClient() {
  // Only two real states here — the mailto: is a best-effort handoff to the
  // user's mail client. We used to flip to "done" 600ms after firing the mailto,
  // which showed a green success even when no mail client was configured (mobile
  // Chrome with no default handler, corporate desktops, etc.) and silently lost
  // the lead. Keep the form visible; surface a persistent copy-fallback below.
  const [attempted, setAttempted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const subject = `Aptura pilot · ${data.get("company") || "(no company)"}`;
    const body = [
      `Company: ${data.get("company")}`,
      `Name: ${data.get("name")}`,
      `Role you'd pilot: ${data.get("role")}`,
      `Team size: ${data.get("teamSize")}`,
      `When you'd start: ${data.get("when")}`,
      `ATS in use today: ${data.get("ats")}`,
      ``,
      `${data.get("context") || ""}`,
    ].join("\n");
    const href = `mailto:hello@aptura.app?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setAttempted(true);
  }

  return (
    <MarketingShell audience="hiring-teams">
      <section className="py-12 lg:py-20">
        <div className="ap-wrap grid items-start gap-12 lg:grid-cols-[1.05fr_1fr]">
          {/* Pitch */}
          <div>
            <span className="ap-eyebrow">Request a pilot</span>
            <h1
              className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Pilot a verified interview on{" "}
              <span className="text-brand">one open role.</span>
            </h1>
            <p className="ap-lead mt-5">
              Run Aptura on a single role. After the pilot, you get a written summary of what
              proctoring caught (and didn&apos;t), the reports your reviewers actually used, and
              the integration shape we&apos;d build for you.
            </p>
            <ul className="mt-7 grid gap-3">
              {[
                ["A real proctored interview", "for every applicant on the pilot role."],
                ["The evidence reports", "your reviewers used to decide — yours to keep."],
                ["A written summary", "of what proctoring caught, the false-positives, and the integration shape."],
                ["A direct line", "to the team building Aptura. Honest answers. Pre-launch posture."],
              ].map(([b, rest]) => (
                <li key={b} className="flex gap-2.5 text-[0.96rem] text-ink-2">
                  <ApIcon name="check" className="mt-[3px] size-[18px] shrink-0 text-brand" />
                  <span>
                    <b className="text-ink-deep">{b}</b> {rest}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-8"
          >
            <h2
              className="text-[1.4rem] font-semibold text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tell us about the role.
            </h2>
            <p className="mt-1.5 text-[0.92rem] text-ink-2">
              Two minutes. No sales call required.
            </p>
            <div className="mt-6 grid gap-4">
              <Field name="company" label="Company" required placeholder="Acme Inc." />
              <Field name="name" label="Your name" required placeholder="First & last" />
              <Field name="role" label="Role you'd pilot" required placeholder="e.g. Senior Backend Engineer" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="teamSize" label="Team size" type="number" placeholder="e.g. 60" />
                <Field name="when" label="You'd start" placeholder="e.g. in 2 weeks" />
              </div>
              <Field name="ats" label="ATS in use today" placeholder="e.g. Greenhouse · Lever · Workday · none" />
              <Field
                name="context"
                label="Anything else?"
                placeholder="The shape of the role, what you've tried, what's broken..."
                as="textarea"
              />
            </div>
            <button
              type="submit"
              className="ap-btn ap-btn-primary ap-btn-lg mt-7 w-full justify-center"
            >
              Open in your mail client
            </button>
            {attempted && (
              <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-[0.86rem] text-ink-2">
                <p className="font-medium text-ink-deep">Didn&apos;t open?</p>
                <p className="mt-1">
                  Some browsers can&apos;t launch mail apps. Write to{" "}
                  <a className="text-brand-strong" href="mailto:hello@aptura.app">
                    hello@aptura.app
                  </a>{" "}
                  with the details above and we&apos;ll get back to you.
                </p>
              </div>
            )}
            <p className="mt-3 text-center text-[0.78rem] text-ink-3">
              Submits as email today. No tracking, no auto-add to lists.
            </p>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  placeholder,
  as,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  as?: "textarea";
}) {
  const id = `f-${name}`;
  const baseInput =
    "w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/45";
  return (
    <div>
      <label htmlFor={id} className="block text-[0.86rem] font-medium text-ink-deep">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      <div className="mt-1.5">
        {as === "textarea" ? (
          <textarea id={id} name={name} required={required} placeholder={placeholder} rows={4} className={baseInput} />
        ) : (
          <input id={id} name={name} type={type} required={required} placeholder={placeholder} className={baseInput} />
        )}
      </div>
    </div>
  );
}
