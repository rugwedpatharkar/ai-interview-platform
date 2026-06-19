// On-device proctoring: typed integrity signals streamed to ai-agents during the
// interview. Mirrors the backend catalog (ai-agents app/model/proctoring.py). SIGNALS
// ONLY — no camera/mic frames or audio ever leave the device. Advisory: the backend
// records flags for human review and never blocks the interview.
import type { TokenStore } from "./tokens.js";

// D (device/behavior) signal types shipped in this slice. B (visual) + C (audio) types
// are added alongside their detectors; the backend catalog is the source of truth.
export type ProctorEventType =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "copy"
  | "paste_large"
  | "devtools_open"
  | "multi_monitor"
  | "keystroke_anomaly";

export interface ProctorEvent {
  type: ProctorEventType;
  at: string; // client ISO timestamp
  meta?: Record<string, unknown>;
}

export function createProctorClient(baseUrl: string, store: TokenStore) {
  async function send(applicationId: string, events: ProctorEvent[]): Promise<void> {
    if (events.length === 0) return;
    const access = store.get()?.access;
    // Best-effort + non-blocking: a proctoring failure must NEVER interrupt the interview
    // (the runtime sends detached), but it must be OBSERVABLE and must NOT lose signals.
    // So on a network error or a non-OK response we warn and throw — the runtime catches the
    // rejection and re-queues the batch for the next flush. `keepalive` lets the final flush
    // survive a page unload.
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/interview/${applicationId}/proctor`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(access ? { authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ events }),
        keepalive: true,
      });
    } catch (err) {
      console.warn("proctor: signal batch send failed (network), will retry", err);
      throw err;
    }
    if (!res.ok) {
      console.warn(`proctor: signal batch send failed (${res.status}), will retry`);
      throw new Error(`proctor send failed (${res.status})`);
    }
  }

  return { send };
}
