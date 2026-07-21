"use client";

import { ApIcon } from "@ip/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/* ============================================================
   APTURA · v3 — Auth card primitives (Aperture Pro)
   Shared by every screen in app/login, /register, /company/register,
   /forgot, /reset, /verify, /auth/callback. Page-local components live
   alongside; this file is just the surfaces every auth screen wears.
   ============================================================ */

/** Full-page chrome: top bar with brand + "back to home", centered auth card,
 *  optional alt-link below the card. */
export function AuthShell({
  eyebrow,
  title,
  sub,
  children,
  altPrompt,
  altHref,
  altLabel,
  topRightHref = "/",
  topRightLabel = "← Back to home",
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  altPrompt?: ReactNode;
  altHref?: string;
  altLabel?: string;
  topRightHref?: string;
  topRightLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line py-4">
        <div className="ap-wrap flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-bold text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <ApIcon name="mark" className="size-7 text-brand" /> Aptura
          </Link>
          <Link
            href={topRightHref}
            className="text-[0.86rem] text-ink-2 hover:text-ink-deep"
          >
            {topRightLabel}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[460px]">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-8">
            {eyebrow && <span className="ap-eyebrow">{eyebrow}</span>}
            <h1
              className={`${eyebrow ? "mt-3" : ""} text-[1.8rem] font-bold leading-[1.1] tracking-[-0.025em] text-ink-deep`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h1>
            {sub && (
              <p className="mt-2 text-[0.96rem] leading-snug text-ink-2">{sub}</p>
            )}
            {children}
          </div>
          {altPrompt && altHref && altLabel && (
            <p className="mt-6 text-center text-[0.86rem] text-ink-3">
              {altPrompt}{" "}
              <Link
                href={altHref}
                className="font-semibold text-ink-deep underline-offset-4 hover:underline"
              >
                {altLabel}
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  minLength,
  value,
  onChange,
  placeholder,
  hint,
  trailing,
  disabled,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  const id = `f-${name}`;
  const base =
    "w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/45 disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-[0.86rem] font-medium text-ink-deep"
        >
          {label}
          {required && <span className="ml-0.5 text-brand">*</span>}
        </label>
        {trailing}
      </div>
      <div className="mt-1.5">
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={base}
        />
      </div>
      {hint && <p className="mt-1.5 text-[0.78rem] text-ink-3">{hint}</p>}
    </div>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[color-mix(in_oklch,var(--danger)_8%,var(--surface))] text-[color-mix(in_oklch,var(--danger)_55%,var(--ink-deep))]"
      : tone === "success"
        ? "border-[color-mix(in_oklch,var(--good)_30%,var(--line))] bg-[color-mix(in_oklch,var(--good)_8%,var(--surface))] text-[color-mix(in_oklch,var(--good)_55%,var(--ink-deep))]"
        : "border-[color-mix(in_oklch,var(--brand)_24%,var(--line))] bg-brand-soft text-brand-strong";
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`rounded-lg border px-3.5 py-2.5 text-[0.88rem] leading-snug ${styles}`}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

/** A minimal teal→ink primary CTA sized for full-width auth-form use. */
export function PrimaryButton({
  type = "button",
  disabled,
  busy,
  busyLabel,
  children,
  onClick,
}: {
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      className="ap-btn ap-btn-primary ap-btn-lg mt-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? busyLabel ?? "Working…" : children}
    </button>
  );
}

/** Helper: pick the post-login landing route based on the decoded role. */
export function roleHome(role: string | undefined | null): string {
  return role === "recruiter" || role === "company_admin" ? "/company" : "/";
}

/** Reads the persisted candidate JWT and returns its `role` claim — used right
 *  after login(), when the AuthProvider's token state hasn't tickled yet.
 *  Key matches makeTokenStore("candidate") in packages/shared/src/tokens.ts. */
export function decodeRoleFromStore(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("ip:candidate:tokens");
    if (!raw) return null;
    const { access } = JSON.parse(raw) as { access?: string };
    if (!access) return null;
    const parts = access.split(".");
    if (parts.length !== 3) return null;
    const payload64 = parts[1] as string;
    const json = atob(payload64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}
