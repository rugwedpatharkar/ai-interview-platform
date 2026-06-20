"use client";

import { Alert, Badge } from "@ip/ui";
import { AlertTriangle, Check } from "lucide-react";

// Live proctoring status: three "ok" chips (one face · eyes on screen · fullscreen) plus a
// danger/warning banner for the most recent non-low flag, and a terminal state when the
// session was auto-ended. The strip is server-driven for the terminate (the client only
// reflects the ack); the chips reflect on-device detector state for at-a-glance feedback.
export interface ProctorState {
  oneFace: boolean;
  eyesOnScreen: boolean;
  fullscreen: boolean;
  recentFlag?: { type: string; severity: "low" | "medium" | "high" };
  terminated?: { reason: string };
}

function chip(ok: boolean, label: string) {
  return (
    <Badge tone={ok ? "success" : "warning"} variant="subtle">
      {ok ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <AlertTriangle className="size-3" aria-hidden />
      )}
      {label}
    </Badge>
  );
}

function humanize(type: string): string {
  return type.replace(/_/g, " ");
}

export function ProctorStatusStrip({ state }: { state: ProctorState }) {
  if (state.terminated) {
    return (
      <Alert tone="danger" title="Interview ended">
        This session was ended automatically because a serious integrity signal was detected
        ({humanize(state.terminated.reason)}). The recruiter has been notified.
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="status"
        aria-live="polite"
      >
        {chip(state.oneFace, "One face")}
        {chip(state.eyesOnScreen, "Eyes on screen")}
        {chip(state.fullscreen, "Fullscreen")}
      </div>
      {state.recentFlag && state.recentFlag.severity !== "low" && (
        <Alert tone={state.recentFlag.severity === "high" ? "danger" : "warning"}>
          Integrity signal detected: {humanize(state.recentFlag.type)}. Keep your face visible
          and stay in fullscreen.
        </Alert>
      )}
    </div>
  );
}
