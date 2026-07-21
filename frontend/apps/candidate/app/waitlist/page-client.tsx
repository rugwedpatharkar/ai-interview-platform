"use client";

import { useState, type FormEvent } from "react";
import { ApIcon, MarketingShell } from "@ip/ui";

/** Candidate waitlist signup. Mailto fallback today; `forms.submitWaitlist` is TBD. */
export function WaitlistClient() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = new FormData(form);
    const subject = `Aptura waitlist · ${data.get("email") || "(no email)"}`;
    const body = [
      `Email: ${data.get("email")}`,
      `Role areas: ${data.get("areas") || "(any)"}`,
      `Location: ${data.get("location") || "(any)"}`,
    ].join("\n");
    const href = `mailto:hello@aptura.app?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setTimeout(() => setStatus("done"), 600);
  }

  return (
    <MarketingShell audience="applicants">
      <section className="py-12 lg:py-20">
        <div className="ap-wrap grid items-start gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="ap-eyebrow text-brand">Candidate waitlist</span>
            <h1
              className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Be among the first to sit{" "}
              <span className="text-brand">a verified interview.</span>
            </h1>
            <p className="ap-lead mt-5">
              Aptura opens to candidates wave-by-wave as pilot roles go live. Tell us where you
              want to land. We&apos;ll let you know when there&apos;s a role you can sit for —
              and you can try a free practice round first, no commitment.
            </p>
            <ul className="mt-7 grid gap-3">
              {[
                ["A real proctored interview", "when there's a role that fits — no fake screening rounds."],
                ["A free practice round", "with the real UI and rubric, before you sit the real one."],
                ["A real answer, every time", "if you sit an Aptura interview, you'll hear back. No ghosting."],
                ["Your data, your way", "right-to-erase is honored across every Aptura artifact."],
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

          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-8"
          >
            {status === "done" ? (
              <div className="grid place-items-center gap-3 py-10 text-center">
                <div className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
                  <ApIcon name="check" className="size-7" />
                </div>
                <h2
                  className="text-[1.4rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Mail composed in your client.
                </h2>
                <p className="max-w-[34ch] text-[0.94rem] text-ink-2">
                  If your mail client didn&apos;t open, write to{" "}
                  <a className="text-brand-strong" href="mailto:hello@aptura.app">
                    hello@aptura.app
                  </a>
                  .
                </p>
              </div>
            ) : (
              <>
                <h2
                  className="text-[1.4rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Join the waitlist
                </h2>
                <p className="mt-1.5 text-[0.92rem] text-ink-2">
                  One email. No tracking, no list-add.
                </p>
                <div className="mt-6 grid gap-4">
                  <Field name="email" type="email" label="Your email" required placeholder="you@example.com" />
                  <Field name="areas" label="Role areas (optional)" placeholder="e.g. backend · design · data" />
                  <Field name="location" label="Location (optional)" placeholder="e.g. Bangalore · remote · EU only" />
                </div>
                <button
                  type="submit"
                  className="ap-btn ap-btn-coral ap-btn-lg mt-7 w-full justify-center"
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? "Opening your mail client…" : "Join the waitlist"}
                </button>
              </>
            )}
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
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[0.86rem] font-medium text-ink-deep">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-soft"
      />
    </div>
  );
}
