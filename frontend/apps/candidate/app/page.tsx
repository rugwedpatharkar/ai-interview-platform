"use client";

import { Logo, ThemeToggle, buttonVariants, cn } from "@ip/ui";
import { useRequireRole } from "@ip/shared";
import {
  ArrowRight,
  ClipboardCheck,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Dashboard } from "../components/dashboard";
import { useAuth } from "../lib/auth";

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "Matched to you",
    body: "See roles that fit your skills, ranked with clear reasons.",
  },
  {
    icon: ClipboardCheck,
    title: "Aptitude in minutes",
    body: "A short, fair test unlocks your interview automatically.",
  },
  {
    icon: MessagesSquare,
    title: "Live AI interview",
    body: "A conversational interview you can take from anywhere.",
  },
];

export default function Home() {
  const { token, identity, ready } = useAuth();
  // Gate on mount so the server render (no localStorage) and first client render match —
  // avoids a hydration mismatch + signed-out flash for logged-in users.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // A token from the wrong app (e.g. a recruiter on the candidate origin) would render a
  // dashboard whose every query 403s; bounce it to login instead of a broken page. Pass
  // "candidate" when signed out so the landing below still shows (no redirect).
  useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready);
  if (!mounted) return null;
  if (token) return identity?.role === "candidate" ? <Dashboard /> : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Subtle violet glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-96 max-w-4xl rounded-full bg-brand-500/15 blur-3xl"
      />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo size="md" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6">
        <section className="flex flex-col items-center py-16 text-center sm:py-24">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Sparkles className="size-3.5" aria-hidden />
            AI-assisted hiring, done fairly
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Find your next role and{" "}
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">
              interview on your terms
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Apply to roles, take a short aptitude test, and complete a live
            interview — all in one place. Sign in to track every application.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Get started
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Log in
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 pb-20 sm:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <h.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-base font-semibold text-foreground">
                {h.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{h.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
