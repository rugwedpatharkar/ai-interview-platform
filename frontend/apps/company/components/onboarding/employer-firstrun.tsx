"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  buttonVariants,
  cn,
} from "@ip/ui";
import { useAuthedQuery } from "@ip/shared";
import {
  ArrowRight,
  Briefcase,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";

import { useAuth } from "../../lib/auth";

interface FirstRunStep {
  id: string;
  title: string;
  hint: string;
  href: string;
  cta: string;
  icon: LucideIcon;
  primary: boolean;
}

const STEPS: FirstRunStep[] = [
  {
    id: "post_first_job",
    title: "Post your first job",
    hint: "Describe the role — the AI builds the aptitude test and interview for you.",
    href: "/jobs/new",
    cta: "Create job",
    icon: Briefcase,
    primary: true,
  },
  {
    id: "invite_team",
    title: "Invite your team",
    hint: "Add recruiters and hiring managers so they can review applicants with you.",
    href: "/team",
    cta: "Invite",
    icon: Users,
    primary: false,
  },
  {
    id: "setup_branding",
    title: "Add your branding",
    hint: "Logo, display name, and an “actively reviewing” badge candidates can see.",
    href: "/branding",
    cta: "Set up",
    icon: Sparkles,
    primary: false,
  },
];

/**
 * Post-first-job nudge for a brand-new company. Renders only when the company has zero
 * jobs (derived from the existing `api.jobs.listJobs` — no new client). Guides the
 * recruiter through posting a job, inviting their team, and branding, and surfaces the
 * recommended advisory gate-mode default. It invites; it never blocks — every nav
 * destination stays reachable without it.
 */
export function EmployerFirstRun() {
  const { api, token } = useAuth();

  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs"],
    queryFn: () => api.jobs.listJobs({}),
  });

  // Render nothing until we know there are zero jobs — a loading flash or an errored
  // fetch must never replace the dashboard below it.
  if (!jobs.data || jobs.data.jobs.length > 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-500" aria-hidden />
          Finish setting up your account
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You haven&rsquo;t posted a job yet. Start here to begin receiving applicants —
          everything below is optional and you can skip back anytime.
        </p>

        <ul className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </span>
              <Link
                href={s.href}
                className={cn(
                  buttonVariants({
                    variant: s.primary ? "default" : "outline",
                    size: "sm",
                  }),
                  "shrink-0",
                )}
              >
                {s.cta}
                {s.primary && <ArrowRight className="size-4" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-surface text-success-foreground">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              Advisory gate by default
              <Badge tone="success" variant="subtle">
                Recommended
              </Badge>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI recommends, you decide — no candidate is ever auto-rejected. You can switch
              a job to auto-advance later in its settings.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
