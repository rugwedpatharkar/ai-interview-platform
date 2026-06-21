"use client";

import { ApIcon } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import {
  AuthShell,
  Field,
  Notice,
  PrimaryButton,
} from "../../components/auth/auth-card";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Verify email
   Two arrivals:
   1. /verify?token=…  — link from the verification email. Calls
      api.auth.verify({ token }). useRef-guarded so React 18 StrictMode
      doesn't fire the verify RPC twice and consume the token.
   2. /verify?email=… (no token) — sent here right after signup. We
      render the "check your inbox" state with a Resend control that
      hits api.auth.resendVerification({ email }).
   ============================================================ */

type Status = "working" | "ok" | "error" | "invalid" | "pending";

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const sp = useSearchParams();
  const { api } = useAuth();
  const initialEmail = sp.get("email") ?? "";
  const context = sp.get("context"); // "company" | null — drives continueHref copy
  const [status, setStatus] = useState<Status>(() =>
    sp.get("token") ? "working" : initialEmail ? "pending" : "invalid",
  );
  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState(initialEmail);
  const [resendState, setResendState] = useState<"idle" | "pending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    const token = sp.get("token");
    if (!token) return; // pending / invalid handled by initial-state branch
    api.auth
      .verify({ token })
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setMessage(errorMessage(err));
      });
  }, [api, sp]);

  async function resend() {
    if (!resendEmail.trim()) return;
    setResendState("pending");
    setResendError(null);
    try {
      await api.auth.resendVerification({ email: resendEmail.trim() });
      setResendState("sent");
    } catch (err) {
      setResendState("idle");
      setResendError(errorMessage(err));
    }
  }

  const continueHref = "/login";
  const continueLabel = context === "company" ? "Sign in to your workspace" : "Sign in to Aptura";

  /* -------- working -------- */
  if (status === "working") {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="Verifying your email…"
        sub="One moment — confirming the link with our auth service."
      >
        <div className="mt-6 grid place-items-center gap-3 py-6">
          <Spinner />
          <p className="text-[0.86rem] text-ink-3">This usually takes a second.</p>
        </div>
      </AuthShell>
    );
  }

  /* -------- ok -------- */
  if (status === "ok") {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="You're verified."
        sub="Your email is confirmed. Sign in to continue."
      >
        <div className="mt-6 grid gap-4">
          <div className="grid place-items-center gap-3 rounded-2xl border border-line bg-surface-2 py-7">
            <div className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
              <ApIcon name="check" className="size-7" />
            </div>
            <p className="text-[0.92rem] text-ink-2">All set — your account is active.</p>
          </div>
          <Link
            href={continueHref}
            className="ap-btn ap-btn-primary ap-btn-lg w-full justify-center"
          >
            {continueLabel}
            <ApIcon name="arrow" className="size-4" />
          </Link>
        </div>
      </AuthShell>
    );
  }

  /* -------- error (verify call failed) -------- */
  if (status === "error") {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="We couldn't verify that link."
        sub="The token may have expired or already been used."
      >
        <div className="mt-6 grid gap-4">
          <Notice tone="danger">{message || "Verification failed."}</Notice>
          <ResendForm
            email={resendEmail}
            setEmail={setResendEmail}
            state={resendState}
            error={resendError}
            onResend={resend}
          />
          <Link
            href="/login"
            className="text-center text-[0.86rem] text-ink-2 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  /* -------- invalid (no token in URL, no email hint either) -------- */
  if (status === "invalid") {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="No verification link found."
        sub="Open the link from your verification email, or request a new one below."
      >
        <div className="mt-6 grid gap-4">
          <Notice tone="danger" title="Missing or invalid link">
            This page expects a one-time token in the URL. Open it from the email we sent you.
          </Notice>
          <ResendForm
            email={resendEmail}
            setEmail={setResendEmail}
            state={resendState}
            error={resendError}
            onResend={resend}
          />
          <Link
            href="/login"
            className="text-center text-[0.86rem] text-ink-2 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  /* -------- pending (came from signup; email known, no token yet) -------- */
  return (
    <AuthShell
      eyebrow="Almost there"
      title="Check your inbox."
      sub={
        <>
          We sent a verification link to{" "}
          <strong className="text-ink-deep">{initialEmail}</strong>. Click it from the same device
          to finish setup.
        </>
      }
    >
      <div className="mt-6 grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-teal-soft text-teal">
              <ApIcon name="bell" className="size-5" />
            </div>
            <div>
              <p className="text-[0.92rem] font-medium text-ink-deep">Verification email sent</p>
              <p className="text-[0.78rem] text-ink-3">Links expire in 30 minutes.</p>
            </div>
          </div>
        </div>
        <ResendForm
          email={resendEmail}
          setEmail={setResendEmail}
          state={resendState}
          error={resendError}
          onResend={resend}
          label="Didn't see it? Send another"
        />
        <Link
          href="/login"
          className="text-center text-[0.86rem] text-ink-2 underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

/* ---------- local helpers ---------- */

function ResendForm({
  email,
  setEmail,
  state,
  error,
  onResend,
  label = "Resend verification email",
}: {
  email: string;
  setEmail: (v: string) => void;
  state: "idle" | "pending" | "sent";
  error: string | null;
  onResend: () => void;
  label?: string;
}) {
  if (state === "sent") {
    return (
      <Notice tone="success">
        If <strong>{email}</strong> needs verification, we&apos;ve sent a new link.
      </Notice>
    );
  }
  return (
    <div className="grid gap-2">
      <Field
        name="resend-email"
        label={label}
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@email.com"
        autoComplete="email"
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <PrimaryButton
        type="button"
        busy={state === "pending"}
        busyLabel="Sending…"
        disabled={!email.trim()}
        onClick={onResend}
      >
        Send verification email
      </PrimaryButton>
    </div>
  );
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block size-7 animate-spin rounded-full border-2 border-line border-t-teal"
    />
  );
}
