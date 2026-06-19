// On-device proctoring: typed integrity signals streamed to ai-agents during the
// interview. Mirrors the backend catalog (ai-agents app/model/proctoring.py). SIGNALS
// ONLY — no camera/mic frames or audio ever leave the device. Advisory: the backend
// records flags for human review and never blocks the interview.
import { authedFetch, restAuthFor } from "./authed-fetch.js";
import { HttpError } from "./errors.js";
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

// Max body size for a single batch (64 KiB). keepalive fetches are capped at 64 KB by
// the browser; chunking ensures we never silently lose events at the unload flush.
const KEEPALIVE_LIMIT = 64 * 1024;

export function createProctorClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  const url = `${baseUrl}/interview/`;

  // Best-effort + non-blocking: a proctoring failure must NEVER interrupt the interview.
  // On a transient failure (network / 5xx) the runtime re-queues the batch for retry.
  // On a permanent failure (4xx) the batch is dropped — re-queuing a definitely-broken
  // payload would loop forever and confuse the retry budget.
  async function send(
    applicationId: string,
    events: ProctorEvent[],
    keepalive = false,
  ): Promise<void> {
    if (events.length === 0) return;
    const body = JSON.stringify({ events });

    // Chunk oversized batches so each fetch stays within the keepalive 64 KiB limit.
    if (keepalive && new Blob([body]).size > KEEPALIVE_LIMIT) {
      const mid = Math.ceil(events.length / 2);
      await send(applicationId, events.slice(0, mid), keepalive);
      await send(applicationId, events.slice(mid), keepalive);
      return;
    }

    let res: Response;
    try {
      res = await authedFetch(
        `${url}${applicationId}/proctor`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          ...(keepalive ? { keepalive: true } : {}),
        },
        auth,
      );
    } catch (err) {
      console.warn("proctor: signal batch send failed (network), will retry", err);
      throw err;
    }
    if (!res.ok) {
      // Permanent 4xx: the payload is definitely broken — drop it rather than retrying.
      if (res.status >= 400 && res.status < 500) {
        console.warn(`proctor: signal batch permanently rejected (${res.status}), dropping`);
        return;
      }
      console.warn(`proctor: signal batch send failed (${res.status}), will retry`);
      throw new HttpError(res.status, `proctor send failed (${res.status})`);
    }
  }

  return { send };
}
