"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Progress,
  applicationStatus,
} from "@ip/ui";
import { TERMINAL_STATES } from "@ip/shared";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import Link from "next/link";

import { FUNNEL_STEPS, funnelStage } from "../lib/funnel";

export interface AppItem {
  applicationId: string;
  jobId: string;
  state: string;
  jobTitle?: string; // optional EXTEND
  companyName?: string; // optional EXTEND
}

/**
 * One application as a funnel-progress card. Derives the stage from `state`; shows the
 * stage CTA (take test / start interview) and a withdraw confirm for non-terminal apps.
 * Pure presentational — the withdraw action + busy flag are passed in by the dashboard.
 */
export function ApplicationCard({
  app,
  onWithdraw,
  withdrawing,
}: {
  app: AppItem;
  onWithdraw: (id: string) => void;
  withdrawing: boolean;
}) {
  const status = applicationStatus(app.state);
  const stage = funnelStage(app.state);
  const title = app.jobTitle ?? `Job ${app.jobId}`;
  const pct = stage.negative ? 100 : ((stage.index + 1) / FUNNEL_STEPS.length) * 100;

  return (
    <Card hoverable>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">{title}</p>
              {app.companyName && (
                <p className="text-sm text-muted-foreground">{app.companyName}</p>
              )}
              <Badge tone={status.tone} className="w-fit">
                {status.label}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {app.state === "aptitude_pending" && (
              <Link href={`/aptitude/${app.applicationId}`}>
                <Button variant="secondary" size="sm">
                  Take test
                </Button>
              </Link>
            )}
            {app.state === "interview_pending" && (
              <Link href={`/interview/${app.applicationId}`}>
                <Button size="sm">Start interview</Button>
              </Link>
            )}
            {!TERMINAL_STATES.has(app.state) && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    Withdraw
                  </Button>
                }
                title="Withdraw application?"
                description="This can't be undone — you'd need to re-apply."
                confirmLabel="Withdraw"
                destructive
                busy={withdrawing}
                onConfirm={() => onWithdraw(app.applicationId)}
              />
            )}
          </div>
        </div>

        {/* Funnel: 4-step rail + a thin progress bar. Negative outcomes render the bar muted. */}
        <div>
          <ol className="flex items-center justify-between text-xs">
            {FUNNEL_STEPS.map((label, i) => {
              const done = !stage.negative && i <= stage.index;
              const current = !stage.ended && i === stage.index;
              return (
                <li key={label} className="flex flex-1 flex-col items-center gap-1">
                  {done ? (
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                  ) : (
                    <Circle
                      className={
                        current
                          ? "size-4 text-brand-500"
                          : "size-4 text-muted-foreground/40"
                      }
                      aria-hidden
                    />
                  )}
                  <span className={done ? "text-foreground" : "text-muted-foreground"}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <Progress
            value={pct}
            size="sm"
            className="mt-2"
            aria-label={`Application progress: ${status.label}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
