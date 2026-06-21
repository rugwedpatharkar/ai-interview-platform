"use client";

import { ApIcon } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  AuthShell,
  Field,
  Notice,
  PrimaryButton,
} from "../../../components/auth/auth-card";
import { useAuth } from "../../../lib/auth";

/* ============================================================
   APTURA · v3 — Company workspace signup
   Backend: api.auth.registerCompany({ companyName, email, password }).
   After success we route to /verify?email=…&context=company so the
   recruiter verifies before the company workspace becomes usable.
   ============================================================ */

export default function CompanyRegisterPage() {
  const router = useRouter();
  const { api } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.registerCompany({ companyName, email, password });
      router.push(
        `/verify?email=${encodeURIComponent(email)}&context=company`,
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your workspace"
      title="Hire with verified interviews."
      sub="A workspace for your team. Post a role, watch proctored interviews come back with evidence — not vibes."
      altPrompt="Already on Aptura?"
      altHref="/login"
      altLabel="Sign in"
    >
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field
          name="companyName"
          label="Company name"
          required
          value={companyName}
          onChange={setCompanyName}
          placeholder="Acme Inc."
        />
        <Field
          name="email"
          label="Work email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          hint="Use the email tied to your hiring team — invites for teammates come next."
        />
        <Field
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
        />
        <PrimaryButton type="submit" busy={busy} busyLabel="Creating workspace…">
          <span className="inline-flex items-center gap-2">
            Create workspace
            <ApIcon name="arrow" className="size-4" />
          </span>
        </PrimaryButton>
        <p className="text-[0.78rem] leading-snug text-ink-3">
          By continuing you agree to Aptura&apos;s{" "}
          <a href="/terms" className="text-ink-2 underline-offset-4 hover:underline">terms</a>
          {" "}and{" "}
          <a href="/dpa" className="text-ink-2 underline-offset-4 hover:underline">data-processing addendum</a>.
        </p>
      </form>

      <p className="mt-5 text-center text-[0.78rem] text-ink-3">
        Looking for a job? <a href="/register" className="font-medium text-ink-2 underline-offset-4 hover:underline">Create a candidate account</a> instead.
      </p>
    </AuthShell>
  );
}
