"use client";

import { ApIcon } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, useEffect, useState } from "react";

import {
  AuthShell,
  Field,
  Notice,
  PrimaryButton,
  decodeRoleFromStore,
  roleHome,
} from "../../components/auth/auth-card";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Sign in (auth-card · Aperture Pro)
   Backend: useAuth().login(email, password). Post-success we route by
   role — recruiters/company admins → /company, candidates → /.
   Pre-launch posture: no fake SSO copy. SSO is on the roadmap.
   ============================================================ */

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { login, identity, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notice = sp.get("notice");
  const noticeText =
    notice === "password-reset"
      ? "Password updated. Sign in with your new password."
      : notice === "account-created"
        ? "Account created. Verify your email, then sign in."
        : null;

  // If a session reappears (second-tab login), bounce on mount.
  useEffect(() => {
    if (ready && identity) router.replace(roleHome(identity.role));
  }, [ready, identity, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // Don't wait for the AuthProvider effect tick — read the role straight
      // from the freshly-persisted token and route.
      router.push(roleHome(decodeRoleFromStore()));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Aptura"
      sub="Pick up your interview, your shortlist, your evidence — exactly where you left it."
      altPrompt="New to Aptura?"
      altHref="/register"
      altLabel="Create an account"
    >
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {noticeText && <Notice tone="info">{noticeText}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Field
          name="email"
          label="Work email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
        />
        <Field
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          minLength={8}
          value={password}
          onChange={setPassword}
          trailing={
            <Link
              href="/forgot"
              className="text-[0.8rem] font-medium text-teal-strong underline-offset-4 hover:underline"
            >
              Forgot?
            </Link>
          }
        />
        <PrimaryButton type="submit" busy={busy} busyLabel="Signing you in…">
          <span className="inline-flex items-center gap-2">
            Sign in
            <ApIcon name="arrow" className="size-4" />
          </span>
        </PrimaryButton>
      </form>

      <p className="mt-5 text-center text-[0.78rem] text-ink-3">
        Hiring? <Link href="/company/register" className="font-medium text-ink-2 underline-offset-4 hover:underline">Create a workspace</Link> instead.
      </p>
    </AuthShell>
  );
}
