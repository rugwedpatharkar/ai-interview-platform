import {
  Alert,
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from "@ip/ui";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import type {
  IntegrityTimeline,
  ProctorFlag,
} from "../app/jobs/[id]/applicants/[appId]/types";
import { severityTone, signalLabel } from "./proctor-labels";
import { ScoreRing } from "./score-ring";

// Integrity score → a 0..1 "clean" fraction for the ring (lower raw score = cleaner).
// 0 → 1.0 (spotless); clamp so a noisy session still reads as low-but-nonzero.
const cleanFraction = (score: number) => Math.max(0, 1 - score / 24);

// Severity → the rail node ring color + the severity pill label/tone.
const SEV_DOT: Record<string, string> = {
  high: "border-danger",
  medium: "border-warning",
  low: "border-primary",
};
const SEV_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Newest-first reads as a timeline; the raw order is event-time ascending from the wire.
function byTime(flags: ProctorFlag[]) {
  return [...flags].sort((a, b) => a.at.localeCompare(b.at));
}

export function IntegrityBand({
  timeline,
  loading,
  error,
}: {
  timeline: IntegrityTimeline | undefined;
  loading: boolean;
  error: string | null;
}) {
  const flags = timeline ? byTime(timeline.flags) : [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 font-display">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          Integrity timeline
        </CardTitle>
        {timeline && (
          <Badge
            tone={
              timeline.autoTerminated
                ? "danger"
                : timeline.flags.length === 0
                  ? "success"
                  : "warning"
            }
          >
            {timeline.autoTerminated
              ? "Gate triggered"
              : timeline.flags.length === 0
                ? "No gate triggered"
                : `${timeline.flags.length} flag${timeline.flags.length > 1 ? "s" : ""}`}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading integrity timeline…
          </span>
        )}
        {error && <Alert tone="warning">Integrity data unavailable: {error}</Alert>}
        {timeline && (
          <>
            {timeline.autoTerminated && (
              <Alert tone="danger">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4" aria-hidden />
                  Interview auto-terminated for a high-severity integrity signal
                  {timeline.terminatedReason && (
                    <> — {signalLabel(timeline.terminatedReason)}</>
                  )}
                  .
                </span>
              </Alert>
            )}

            <div className="flex items-center gap-4">
              <ScoreRing
                value={cleanFraction(timeline.integrityScore)}
                size={72}
                tone={
                  timeline.autoTerminated
                    ? "danger"
                    : timeline.flags.length
                      ? "warning"
                      : "success"
                }
                label="Integrity"
              />
              <div className="text-sm text-muted-foreground">
                {timeline.flags.length === 0
                  ? "No proctoring flags were raised during this interview."
                  : `Weighted integrity score ${timeline.integrityScore} — higher means more concerning. Review the timeline below.`}
              </div>
            </div>

            {flags.length > 0 && (
              <ul className="relative flex flex-col before:absolute before:bottom-2 before:left-[6px] before:top-2 before:w-px before:bg-border">
                {flags.map((f, i) => (
                  <li
                    key={i}
                    className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 pl-6"
                  >
                    <span
                      className={`absolute left-0 size-3.5 rounded-full border-2 bg-surface ${
                        SEV_DOT[f.severity] ?? "border-border"
                      }`}
                      aria-hidden
                    />
                    <time
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                      dateTime={f.at}
                    >
                      {new Date(f.at).toLocaleTimeString()}
                    </time>
                    <span className="text-sm font-medium text-foreground">
                      {signalLabel(f.type)}
                    </span>
                    <Badge tone={severityTone(f.severity) as BadgeTone}>
                      {SEV_LABEL[f.severity] ?? f.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />A single high-severity
              signal auto-gates the interview server-side.
            </p>

            {timeline.recordingUrl && (
              <div>
                <p className="mb-1.5 font-display text-sm font-medium text-foreground">
                  Session recording
                </p>
                <video
                  src={timeline.recordingUrl}
                  controls
                  className="w-full rounded-lg border border-border"
                  aria-label="Proctored interview session recording"
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
