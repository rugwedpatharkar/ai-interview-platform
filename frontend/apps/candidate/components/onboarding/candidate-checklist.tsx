"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  buttonVariants,
  cn,
} from "@ip/ui";
import { useAuthedQuery } from "@ip/shared";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileUp,
  Search,
  type LucideIcon,
  Sparkles,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "../../lib/auth";

interface ProfileShape {
  resumeUploaded: boolean;
  parsed: boolean;
  confirmed: boolean;
  completeness: number;
  fullName: string;
  jobPreference: string;
  location: string;
  experience: unknown[];
  skills: string[];
}

interface ChecklistStep {
  id: string;
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  done: boolean;
}

interface Nudge {
  id: string;
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

const NUDGES: Nudge[] = [
  {
    id: "explore_jobs",
    title: "Find jobs",
    hint: "Search open roles — your match score is on every card.",
    href: "/jobs",
    icon: Search,
  },
  {
    id: "try_practice",
    title: "Try a practice interview",
    hint: "A private mock interview, just for you — never shared with employers.",
    href: "/practice",
    icon: Sparkles,
  },
];

// The three required steps, each derived from real profile fields the server already
// returns — no separate onboarding store. `review_profile` is "done" once the candidate
// has confirmed parsed data (or filled their name + at least one experience); preferences
// count as set once a job preference or a location-with-relocation intent exists.
function deriveSteps(p: ProfileShape): ChecklistStep[] {
  return [
    {
      id: "upload_resume",
      title: "Upload your résumé",
      hint: "We extract your experience and skills.",
      href: "/profile",
      icon: FileUp,
      done: p.resumeUploaded,
    },
    {
      id: "review_profile",
      title: "Review your details",
      hint: "Confirm what we parsed.",
      href: "/profile",
      icon: ClipboardCheck,
      done: p.confirmed || (!!p.fullName.trim() && p.experience.length > 0),
    },
    {
      id: "set_preferences",
      title: "Set your preferences",
      hint: "Role, location, remote.",
      href: "/profile",
      icon: SlidersHorizontal,
      done: !!p.jobPreference.trim() || !!p.location.trim(),
    },
  ];
}

/**
 * First-run checklist + nudges on the candidate dashboard. Renders only when the profile
 * is incomplete (`completeness < 100`) and the candidate hasn't dismissed it this session.
 * Never blocks the dashboard — it's a nudge surface that sits above the tracker. Step
 * states are derived from the existing `api.profile.getProfile` response (no new client).
 */
export function CandidateChecklist() {
  const { api, token } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const profile = useAuthedQuery(token, {
    queryKey: ["profile"],
    queryFn: () => api.profile.getProfile({}),
  });

  // Loading or no data → render nothing (never a blocking spinner). A failed fetch is
  // silent here too: the dashboard's own surfaces still render.
  if (!profile.data || dismissed) return null;

  const p = profile.data as ProfileShape;
  if (p.completeness >= 100) return null;

  const steps = deriveSteps(p);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Finish setting up your profile</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={X}
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {doneCount} of {steps.length} done
            </span>
            <span className="font-semibold tabular-nums text-primary">
              {p.completeness}%
            </span>
          </div>
          <Progress value={p.completeness} aria-label="Profile setup progress" />
        </div>

        <ul className="flex flex-col gap-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {s.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle
                    className="size-4 shrink-0 text-muted-foreground/50"
                    aria-hidden
                  />
                )}
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      s.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </span>
              {!s.done && (
                <Link
                  href={s.href}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                >
                  Start
                </Link>
              )}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NUDGES.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <n.icon className="size-4" aria-hidden />
                </span>
                {n.title}
              </span>
              <span className="text-xs text-muted-foreground">{n.hint}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
