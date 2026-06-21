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
} from "../../components/auth/auth-card";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Reset password
   Backend: api.auth.resetPassword({ token, newPassword }).
   Reads ?token= from the URL; if absent we render an invalid-link
   state instead of an empty form. On success → /login?notice=password-reset.
   ============================================================ */

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { api } = useAuth();
  // null = still mounting (avoids SSR mismatch); "" = no token; otherwise the token.
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(sp.get("token") ?? "");
  }, [sp]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match. Try again.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword({ token: token ?? "", newPassword: password });
      router.push("/login?notice=password-reset");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (token === "") {
    return (
      <AuthShell
        eyebrow="Reset password"
        title="This link is no longer valid."
        sub="Password reset links expire after 30 minutes. Request a new one to continue."
      >
        <div className="mt-6 grid gap-4">
          <Notice tone="danger" title="Invalid or expired link">
            The token in this URL is missing or already used. No action was taken on your account.
          </Notice>
          <Link
            href="/forgot"
            className="ap-btn ap-btn-primary ap-btn-lg w-full justify-center"
          >
            Request a new link
            <ApIcon name="arrow" className="size-4" />
          </Link>
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

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Choose a new password."
      sub="Use something memorable — at least 8 characters with a number or symbol."
      altPrompt="Changed your mind?"
      altHref="/login"
      altLabel="Back to sign in"
    >
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field
          name="password"
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          disabled={token === null}
        />
        <Field
          name="confirm"
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={setConfirm}
          placeholder="Type it again"
          disabled={token === null}
        />
        <PrimaryButton
          type="submit"
          busy={busy}
          busyLabel="Updating password…"
          disabled={token === null}
        >
          Set new password
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
