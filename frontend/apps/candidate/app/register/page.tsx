"use client";

import { ApIcon } from "@ip/ui";
import { Code, errorMessage, isCode, track } from "@ip/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  AuthShell,
  Field,
  Notice,
  PrimaryButton,
} from "../../components/auth/auth-card";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Candidate signup
   Backend: useAuth().register(email, password) → api.auth.registerCandidate
   (wired via lib/auth.tsx) followed by an auto-login. After success we
   route to /verify?email=… so the candidate can prove ownership.
   ============================================================ */

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = scorePassword(password);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password);
      track("auth.registered", { role: "candidate" });
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      // AlreadyExists gets a signup-specific line; InvalidArgument falls through to
      // errorMessage(), which already surfaces the server's own validation message.
      setError(
        isCode(err, Code.AlreadyExists)
          ? "An account with this email already exists."
          : errorMessage(err),
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title="Apply, take the interview, hear back."
      sub="One account for every Aptura interview. No résumés get lost. No applications get ignored."
      altPrompt="Already have an account?"
      altHref="/login"
      altLabel="Sign in"
    >
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
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
        <div>
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
          <PasswordMeter strength={strength} />
        </div>
        <PrimaryButton type="submit" busy={busy} busyLabel="Creating your account…" disabled={!email.trim() || !password || busy}>
          <span className="inline-flex items-center gap-2">
            Create account
            <ApIcon name="arrow" className="size-4" />
          </span>
        </PrimaryButton>
        <p className="text-[0.78rem] leading-snug text-ink-3">
          By continuing you agree to Aptura&apos;s{" "}
          <a href="/terms" className="text-ink-2 underline-offset-4 hover:underline">terms</a>
          {" "}and{" "}
          <a href="/privacy" className="text-ink-2 underline-offset-4 hover:underline">privacy notice</a>.
        </p>
      </form>
    </AuthShell>
  );
}

/* ---------- password strength (length + uppercase + number + symbol) ---------- */

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tone: "weak" | "fair" | "good" | "strong" };

function scorePassword(pw: string): Strength {
  if (!pw) return { score: 0, label: "Empty", tone: "weak" };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const s = score as 0 | 1 | 2 | 3 | 4;
  if (s <= 1) return { score: s, label: "Too short or simple", tone: "weak" };
  if (s === 2) return { score: s, label: "Fair", tone: "fair" };
  if (s === 3) return { score: s, label: "Good", tone: "good" };
  return { score: s, label: "Strong", tone: "strong" };
}

function PasswordMeter({ strength }: { strength: Strength }) {
  const colorMap: Record<Strength["tone"], string> = {
    weak: "var(--danger)",
    fair: "var(--warn)",
    good: "var(--teal)",
    strong: "var(--good)",
  };
  return (
    <div className="mt-2 grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1.5 rounded-full bg-surface-3 transition-colors"
            style={{
              background:
                i <= strength.score
                  ? colorMap[strength.tone]
                  : "var(--surface-3)",
            }}
          />
        ))}
      </div>
      <p className="text-[0.74rem] text-ink-3">{strength.label}</p>
    </div>
  );
}
