"use client";

import { ApIcon } from "@ip/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import {
  AuthShell,
  Field,
  Notice,
  PrimaryButton,
} from "../../components/auth/auth-card";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Forgot password
   Backend: api.auth.forgotPassword({ email }). We ALWAYS render a
   neutral confirmation regardless of whether the account exists —
   account-enumeration leaks are the only thing this screen guards.
   ============================================================ */

export default function ForgotPage() {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    // Best-effort — failure stays silent. The neutral message below
    // is the user-visible truth regardless of what the API returns.
    try {
      await api.auth.forgotPassword({ email });
    } catch {
      // intentional: anti-enumeration
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <AuthShell
      eyebrow="Reset your password"
      title={sent ? "Check your inbox." : "Forgot your password?"}
      sub={
        sent
          ? "If an account exists with that email, a reset link is on its way. The link expires in 30 minutes."
          : "Enter the email tied to your account and we'll send a reset link."
      }
      altPrompt="Remembered it?"
      altHref="/login"
      altLabel="Back to sign in"
    >
      {sent ? (
        <div className="mt-6 grid gap-4">
          <Notice tone="success">
            If an account exists for <strong>{email || "that address"}</strong>, a reset link is on its way.
          </Notice>
          <p className="text-[0.86rem] leading-snug text-ink-2">
            Didn&apos;t see it? Check spam, or wait a minute and{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-medium text-teal-strong underline-offset-4 hover:underline"
            >
              try a different email
            </button>
            .
          </p>
          <Link
            href="/login"
            className="ap-btn ap-btn-ghost ap-btn-lg w-full justify-center"
          >
            <ApIcon name="arrow" className="size-4 rotate-180" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
          <Field
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@email.com"
          />
          <PrimaryButton type="submit" busy={busy} busyLabel="Sending reset link…">
            Send reset link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
