"use client";

import {
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ip/ui";
import { ShieldCheck } from "lucide-react";

import type {
  IntegrityTimeline,
  ReportDTO,
} from "../app/jobs/[id]/applicants/[appId]/types";
import { CompetencyCard } from "./competency-card";
import { DecisionControl } from "./decision-control";
import { IntegrityBand } from "./integrity-band";
import { ScoreRing } from "./score-ring";

const REC_TONE: Record<string, BadgeTone> = {
  advance: "success",
  hold: "warning",
  reject: "danger",
};
const recTone = (s: number) => (s >= 0.75 ? "success" : s >= 0.5 ? "warning" : "danger");

export function ReportView({
  report,
  jobId,
  timeline,
  timelineLoading,
  timelineError,
}: {
  report: ReportDTO;
  jobId: string;
  timeline: IntegrityTimeline | undefined;
  timelineLoading: boolean;
  timelineError: string | null;
}) {
  const integrityTone: BadgeTone = report.autoTerminated
    ? "danger"
    : report.integrityFlagCount > 0
      ? "warning"
      : "success";
  const integrityLabel = report.autoTerminated
    ? "Terminated"
    : report.integrityFlagCount > 0
      ? `${report.integrityFlagCount} flag${report.integrityFlagCount > 1 ? "s" : ""}`
      : "Clean";

  return (
    <div className="flex flex-col gap-5">
      {/* Verdict header + summary band */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="font-display">Interview report</CardTitle>
          <Badge tone={REC_TONE[report.recommendation] ?? "neutral"}>
            Verdict · {report.recommendation || "—"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <ScoreRing
              value={report.overallScore}
              size={132}
              stroke={10}
              tone={recTone(report.overallScore)}
              label="Overall"
            />
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <SummaryStat
                label="Recommendation"
                value={report.recommendation || "—"}
              />
              <SummaryStat
                label="Overall score"
                value={`${Math.round(report.overallScore * 100)}%`}
                mono
              />
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Integrity
                </span>
                <Badge tone={integrityTone} className="self-start">
                  {integrityLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {report.integrityFlagCount} signal
                  {report.integrityFlagCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          {report.executiveSummary && (
            <p className="text-sm leading-relaxed text-foreground">
              {report.executiveSummary}
            </p>
          )}

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            Server-authoritatively proctored &amp; AI-scored · camera, mic &amp; screen
            monitored throughout
          </p>
        </CardContent>
      </Card>

      {/* Highlights / Risks */}
      {(report.highlights.length > 0 || report.risks.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          <ReportSection
            title="Highlights"
            items={report.highlights}
            tone="text-success-foreground"
            dot="bg-success"
          />
          <ReportSection
            title="Risks"
            items={report.risks}
            tone="text-warning-foreground"
            dot="bg-warning"
          />
        </div>
      )}

      {/* Competency breakdown */}
      {report.competencies.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="font-display">Competency breakdown</CardTitle>
            <Badge tone="neutral">
              {report.competencies.length} dimension
              {report.competencies.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent>
            {report.competencies.map((c) => (
              <CompetencyCard key={c.competency} c={c} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* advance/shortlist/decline — records an audited decision that notifies the candidate */}
      {["scored", "shortlisted"].includes(report.state) && (
        <Card>
          <CardContent className="p-4">
            <DecisionControl applicationId={report.applicationId} jobId={jobId} />
          </CardContent>
        </Card>
      )}

      {/* The integrity band is its own card so it reads as a distinct trust surface. Render
          it whenever there's a timeline, it's loading, there's an error, OR the report
          itself flags a termination (so the banner shows even if the timeline query lags). */}
      {(timeline ||
        timelineLoading ||
        timelineError ||
        report.autoTerminated ||
        report.integrityFlagCount > 0) && (
        <IntegrityBand
          timeline={timeline}
          loading={timelineLoading}
          error={timelineError}
        />
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-display text-lg font-semibold capitalize text-foreground${
          mono ? " tabular-nums" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ReportSection({
  title,
  items,
  tone,
  dot,
}: {
  title: string;
  items: string[];
  tone: string;
  dot: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="font-display text-sm font-semibold text-foreground">{title}</p>
        <ul className={`flex flex-col gap-1.5 text-sm ${tone}`}>
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`}
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
