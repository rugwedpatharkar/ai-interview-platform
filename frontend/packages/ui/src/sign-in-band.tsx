"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@ip/shared";
import { ApIcon } from "./aperture-sprite.js";
import type { LandingAudience } from "./aperture-chrome.js";

export interface SignInBandProps {
  audience: LandingAudience;
  /** Injected by the consumer because @ip/ui can't import the app's useAuth hook. */
  useAuthHook: () => {
    login: (email: string, password: string) => Promise<void>;
  };
}

const COPY = {
  applicants: {
    eyebrow: "Returning?",
    headline: "Pick up where you left off.",
    bullets: [
      "Your applications and their status, in one place.",
      "Your saved jobs and alerts, still warm.",
      "Your interview score and feedback, when it lands.",
    ],
    accent: "coral",
    signupHref: "/register",
    signupLabel: "Create one →",
    nextRoute: "/",
  },
  "hiring-teams": {
    eyebrow: "Returning?",
    headline: "Pick up where you left off.",
    bullets: [
      "Your funnel and the candidates moving through it.",
      "Your pipeline and decisions in flight.",
      "Your audit log — every decision, signed.",
    ],
    accent: "teal",
    signupHref: "/company/register",
    signupLabel: "Create one →",
    nextRoute: "/company",
  },
} as const;

export function SignInBand({ audience, useAuthHook }: SignInBandProps) {
  const { login } = useAuthHook();
  const router = useRouter();
  const copy = COPY[audience];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push(copy.nextRoute);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const tone = audience === "hiring-teams" ? "teal" : "coral";
  const bandBg =
    audience === "hiring-teams"
      ? "color-mix(in oklch, var(--teal) 4%, var(--surface-2))"
      : "color-mix(in oklch, var(--coral) 4%, var(--surface-2))";

  return (
    <section
      id="sign-in"
      className="border-t border-line py-16 lg:py-24"
      style={{ background: bandBg }}
    >
      <div className="ap-wrap grid items-start gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        {/* Left: pitch */}
        <div>
          <span
            className={`text-[0.78rem] font-semibold uppercase tracking-[0.16em] ${
              tone === "teal" ? "text-teal-strong" : "text-coral"
            }`}
          >
            {copy.eyebrow}
          </span>
          <h2
            className="mt-2 text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {copy.headline}
          </h2>
          <ul className="mt-6 grid gap-2.5">
            {copy.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[0.96rem] text-ink-2">
                <ApIcon
                  name="check"
                  className={`mt-[3px] size-[18px] shrink-0 ${
                    tone === "teal" ? "text-teal" : "text-coral"
                  }`}
                />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: form */}
        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-8"
          aria-labelledby="sign-in-form-title"
        >
          <h3
            id="sign-in-form-title"
            className="text-[1.2rem] font-semibold text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sign in
          </h3>
          <div className="mt-5 grid gap-4">
            <div>
              <label
                htmlFor="sign-in-email"
                className="block text-[0.86rem] font-medium text-ink-deep"
              >
                Email
              </label>
              <input
                id="sign-in-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-1.5 w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:outline-none focus:ring-4 ${
                  tone === "teal"
                    ? "focus:border-teal focus:ring-teal-soft"
                    : "focus:border-coral focus:ring-coral-soft"
                }`}
              />
            </div>
            <div>
              <label
                htmlFor="sign-in-password"
                className="block text-[0.86rem] font-medium text-ink-deep"
              >
                Password
              </label>
              <input
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`mt-1.5 w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:outline-none focus:ring-4 ${
                  tone === "teal"
                    ? "focus:border-teal focus:ring-teal-soft"
                    : "focus:border-coral focus:ring-coral-soft"
                }`}
              />
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[0.88rem] text-danger"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`mt-5 w-full justify-center ap-btn ap-btn-lg ${
              tone === "teal" ? "ap-btn-primary" : "ap-btn-coral"
            }`}
          >
            {submitting ? "Signing you in…" : "Sign in"}
          </button>
          <Link
            href="/forgot"
            className="mt-3 block text-center text-[0.86rem] font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
          >
            Forgot password?
          </Link>
          <p className="mt-6 border-t border-line pt-4 text-center text-[0.88rem] text-ink-2">
            Don&apos;t have an account?{" "}
            <Link
              href={copy.signupHref}
              className={
                tone === "teal"
                  ? "font-semibold text-teal-strong hover:underline"
                  : "font-semibold text-coral hover:underline"
              }
            >
              {copy.signupLabel}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
