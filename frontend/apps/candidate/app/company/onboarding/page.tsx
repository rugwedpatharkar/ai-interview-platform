"use client";

import { Field, Input, Textarea, toast } from "@ip/ui";
import { useRequireRole } from "@ip/shared";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";

/* ============================================================
   APTURA · v3 — Company onboarding (`/company/onboarding`)
   4-step wizard (like candidate-onboarding):
     1. Company profile (name, logo URL optional, website)
     2. First role draft (title + required skills)
     3. Invite team (multi-email field)
     4. Billing link (deferred — link to /company/billing)
   Persists step + values in localStorage so a refresh
   doesn't lose progress. On done → router.push('/company').
   ============================================================ */

const STORAGE_KEY = "aptura.company-onboarding.progress.v1";

interface WizardState {
  step: 1 | 2 | 3 | 4;
  companyName: string;
  companyWebsite: string;
  companyLogoUrl: string;
  roleTitle: string;
  roleSkillsRaw: string;
  teamEmails: string[];
}

const INITIAL: WizardState = {
  step: 1,
  companyName: "",
  companyWebsite: "",
  companyLogoUrl: "",
  roleTitle: "",
  roleSkillsRaw: "",
  teamEmails: [""],
};

const STEPS: { n: 1 | 2 | 3 | 4; label: string; hint: string }[] = [
  { n: 1, label: "Company profile", hint: "How the company shows to candidates" },
  { n: 2, label: "First role draft", hint: "Start a posting — finish later" },
  { n: 3, label: "Invite team", hint: "Hiring lanes for your colleagues" },
  { n: 4, label: "Billing", hint: "Set up later in Settings" },
];

function loadState(): WizardState {
  if (typeof window === "undefined") return INITIAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return { ...INITIAL, ...parsed, step: clampStep(parsed.step) };
  } catch {
    return INITIAL;
  }
}

function clampStep(s: WizardState["step"] | number | undefined): WizardState["step"] {
  if (s === 1 || s === 2 || s === 3 || s === 4) return s;
  return 1;
}

function saveState(s: WizardState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota or private mode — onboarding still works in-memory.
  }
}

function clearState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export default function CompanyOnboardingPage() {
  const { token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<WizardState>(INITIAL);

  // Hydrate from localStorage post-mount so SSR / first paint stays deterministic.
  useEffect(() => {
    setState(loadState());
    setMounted(true);
  }, []);

  // Persist on every change once we've mounted (skip first render to avoid a no-op write).
  useEffect(() => {
    if (mounted) saveState(state);
  }, [state, mounted]);

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  const setStep = (step: WizardState["step"]) => setState((s) => ({ ...s, step }));

  function next() {
    if (state.step === 1 && !state.companyName.trim()) {
      toast.error("Company name is required to continue.");
      return;
    }
    if (state.step === 4) {
      toast.success("You're set up — welcome to the workspace.");
      clearState();
      router.push("/company");
      return;
    }
    setStep((state.step + 1) as WizardState["step"]);
  }

  function back() {
    if (state.step === 1) return;
    setStep((state.step - 1) as WizardState["step"]);
  }

  function skip() {
    if (state.step === 4) {
      clearState();
      router.push("/company");
      return;
    }
    setStep((state.step + 1) as WizardState["step"]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    next();
  }

  return (
    <CompanyShell>
      <div className="ap-section-head">
        <span className="ap-eyebrow">Setup</span>
        <h1 className="ap-h2">Welcome to your workspace</h1>
        <p className="ap-lead">
          Four short steps to get your company posting, screening and deciding on the
          same page. You can finish any step later.
        </p>
      </div>

      {/* Progress bar */}
      <ol className="mt-6 grid gap-3 sm:grid-cols-4">
        {STEPS.map((s) => {
          const done = s.n < state.step;
          const active = s.n === state.step;
          return (
            <li
              key={s.n}
              className={
                active
                  ? "rounded-2xl border-2 border-teal bg-teal-soft p-3"
                  : done
                    ? "rounded-2xl border border-line bg-surface-2 p-3"
                    : "rounded-2xl border border-line bg-surface p-3"
              }
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={
                    done
                      ? "grid size-6 place-items-center rounded-full bg-teal text-teal-ink"
                      : "grid size-6 place-items-center rounded-full bg-surface-3 text-ink-2"
                  }
                >
                  {done ? <Check className="size-3.5" /> : s.n}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-deep">{s.label}</div>
                  <div className="truncate text-xs text-ink-3">{s.hint}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5" noValidate>
        {state.step === 1 && (
          <section className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Step 1 of 4</span>
            <h2 className="ap-h3 mb-1">Company profile</h2>
            <p className="text-sm text-ink-2">
              The name and link candidates see on every role you post. You can add a
              logo URL now or upload one later from Settings.
            </p>
            <div className="mt-5 grid gap-4">
              <Field label="Company name" htmlFor="company">
                <Input
                  id="company"
                  required
                  value={state.companyName}
                  onChange={(e) =>
                    setState((s) => ({ ...s, companyName: e.target.value }))
                  }
                />
              </Field>
              <Field label="Website" htmlFor="website" hint="Used for verification only — not shown publicly.">
                <Input
                  id="website"
                  type="url"
                  value={state.companyWebsite}
                  placeholder="https://yourcompany.com"
                  onChange={(e) =>
                    setState((s) => ({ ...s, companyWebsite: e.target.value }))
                  }
                />
              </Field>
              <Field label="Logo URL (optional)" htmlFor="logo">
                <Input
                  id="logo"
                  type="url"
                  value={state.companyLogoUrl}
                  placeholder="https://cdn.example/logo.png"
                  onChange={(e) =>
                    setState((s) => ({ ...s, companyLogoUrl: e.target.value }))
                  }
                />
              </Field>
            </div>
          </section>
        )}

        {state.step === 2 && (
          <section className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Step 2 of 4</span>
            <h2 className="ap-h3 mb-1">First role draft</h2>
            <p className="text-sm text-ink-2">
              Start a posting — you don&apos;t have to publish it now. Skip if you want
              to come back later.
            </p>
            <div className="mt-5 grid gap-4">
              <Field label="Job title" htmlFor="role">
                <Input
                  id="role"
                  value={state.roleTitle}
                  placeholder="e.g. Senior Product Designer"
                  onChange={(e) =>
                    setState((s) => ({ ...s, roleTitle: e.target.value }))
                  }
                />
              </Field>
              <Field
                label="Required skills"
                htmlFor="skills"
                hint="Comma-separated — e.g. figma, design systems, prototyping"
              >
                <Textarea
                  id="skills"
                  rows={3}
                  value={state.roleSkillsRaw}
                  onChange={(e) =>
                    setState((s) => ({ ...s, roleSkillsRaw: e.target.value }))
                  }
                />
              </Field>
            </div>
            <p className="mt-4 text-xs text-ink-3">
              You&apos;ll finish the full posting (description, salary, rubric) inside
              the job editor.
            </p>
          </section>
        )}

        {state.step === 3 && (
          <section className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Step 3 of 4</span>
            <h2 className="ap-h3 mb-1">Invite your team</h2>
            <p className="text-sm text-ink-2">
              Jot down who you&apos;d like on board. Recruiter seats let teammates read
              every report and sign decisions.
            </p>
            <div className="mt-5 grid gap-2">
              {state.teamEmails.map((email, i) => {
                const invalid = email.trim().length > 0 && !isValidEmail(email);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="email"
                      aria-label={`Teammate email ${i + 1}`}
                      aria-invalid={invalid || undefined}
                      value={email}
                      placeholder="colleague@yourcompany.com"
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          teamEmails: s.teamEmails.map((v, j) =>
                            j === i ? e.target.value : v,
                          ),
                        }))
                      }
                      className="flex-1"
                    />
                    {state.teamEmails.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove teammate ${i + 1}`}
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            teamEmails: s.teamEmails.filter((_, j) => j !== i),
                          }))
                        }
                        className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-2"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, teamEmails: [...s.teamEmails, ""] }))
                }
                className="ap-btn ap-btn-ghost ap-btn-sm mt-1 self-start"
              >
                <Plus className="size-4" aria-hidden /> Add another teammate
              </button>
            </div>
            <p className="mt-4 text-xs text-ink-3">
              This is a quick setup preview — nothing is sent yet. Invite teammates
              anytime from Settings → Team.
            </p>
          </section>
        )}

        {state.step === 4 && (
          <section className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Step 4 of 4</span>
            <h2 className="ap-h3 mb-1">Billing</h2>
            <p className="text-sm text-ink-2">
              Aptura is in pre-launch — you don&apos;t need to set up billing now.
              Visit the billing settings whenever you&apos;re ready.
            </p>
            <button
              type="button"
              onClick={() => router.push("/company/billing")}
              className="ap-btn ap-btn-ghost ap-btn-sm mt-4 inline-flex"
            >
              Open billing settings
            </button>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={state.step === 1}
            className="ap-btn ap-btn-ghost disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden /> Back
          </button>
          <div className="flex gap-2">
            {state.step < 4 && (
              <button type="button" onClick={skip} className="ap-btn ap-btn-ghost">
                Skip for now
              </button>
            )}
            <button type="submit" className="ap-btn ap-btn-primary">
              {state.step === 4 ? "Finish setup" : "Continue"}
              {state.step < 4 && <ChevronRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </form>
    </CompanyShell>
  );
}
