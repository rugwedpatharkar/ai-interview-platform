import {
  Alert,
  Badge,
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
import { SEVERITY_ORDER, severityTone, signalLabel } from "./proctor-labels";
import { ScoreRing } from "./score-ring";

// Integrity score → a 0..1 "clean" fraction for the ring (lower raw score = cleaner).
// 0 → 1.0 (spotless); clamp so a noisy session still reads as low-but-nonzero.
const cleanFraction = (score: number) => Math.max(0, 1 - score / 24);

function groupBySeverity(flags: ProctorFlag[]) {
  return SEVERITY_ORDER.map((sev) => ({
    sev,
    items: flags.filter((f) => f.severity === sev),
  })).filter((g) => g.items.length > 0);
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
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          Interview integrity
        </CardTitle>
        {timeline && !timeline.autoTerminated && (
          <Badge tone={timeline.flags.length === 0 ? "success" : "warning"}>
            {timeline.flags.length === 0
              ? "No flags"
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
                  : `Weighted integrity score ${timeline.integrityScore} — higher means more concerning. Review the flags below.`}
              </div>
            </div>

            {groupBySeverity(timeline.flags).map(({ sev, items }) => (
              <div key={sev}>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-medium capitalize text-foreground">
                  {sev} severity
                  <Badge tone={severityTone(sev)}>{items.length}</Badge>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {items.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm"
                    >
                      <span className="text-foreground">{signalLabel(f.type)}</span>
                      <time
                        className="font-mono text-xs text-muted-foreground"
                        dateTime={f.at}
                      >
                        {new Date(f.at).toLocaleTimeString()}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {timeline.recordingUrl && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">
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
