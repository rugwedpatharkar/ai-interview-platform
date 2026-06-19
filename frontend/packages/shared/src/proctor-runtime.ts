// Browser-edge proctoring runtime: attaches device/behavior (D) detectors, batches the
// typed events they emit, and flushes them on an interval. No model assets and no
// camera/mic — pure Web APIs. `startProctoring` returns a stop() that detaches every
// listener and flushes the tail. Capture only ever runs after explicit consent (the
// caller gates the start), and nothing but typed events leaves the device.
import type { ProctorEvent, ProctorEventType } from "./proctor.js";

export interface ProctorRuntimeOptions {
  // `keepalive` is true only on the final unload flush so the request survives page
  // teardown. Interval flushes omit it (defaults false) to stay within the 64 KB limit.
  send: (events: ProctorEvent[], keepalive?: boolean) => void | Promise<void>;
  flushMs?: number; // batch flush cadence (default 5000ms)
  pasteThreshold?: number; // chars that make a paste "large" (default 200)
}

export function startProctoring(opts: ProctorRuntimeOptions): () => void {
  const flushMs = opts.flushMs ?? 5000;
  const pasteThreshold = opts.pasteThreshold ?? 200;
  let queue: ProctorEvent[] = [];

  const emit = (type: ProctorEventType, meta?: Record<string, unknown>) => {
    queue.push({ type, at: new Date().toISOString(), meta });
  };

  const flush = (keepalive = false) => {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    // Detached so a slow/failing send never blocks the interview. On a transient failure
    // re-queue the batch (ahead of anything emitted meanwhile, preserving rough order) so
    // the next flush retries. Permanent 4xx drops are handled inside `send` itself.
    void Promise.resolve(opts.send(batch, keepalive)).catch(() => {
      queue = [...batch, ...queue];
    });
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") emit("tab_hidden");
  };
  const onBlur = () => emit("window_blur");
  const onFullscreenChange = () => {
    if (!document.fullscreenElement) emit("fullscreen_exit");
  };
  const onCopy = () => emit("copy");
  const onPaste = (e: ClipboardEvent) => {
    // getData can throw under restricted clipboard access (some browsers/policies). The
    // detector must never crash the page — skip the length read and still record the paste.
    let len = 0;
    try {
      len = e.clipboardData?.getData("text")?.length ?? 0;
    } catch {
      emit("paste_large");
      return;
    }
    if (len >= pasteThreshold) emit("paste_large", { length: len });
  };

  // Keystroke cadence: flag a sustained implausibly-fast run (paste-like auto-typing).
  // Advisory + heuristic — a false positive is just a low-severity timeline note.
  let lastKey = 0;
  let fastRun = 0;
  const onKeydown = () => {
    const now = Date.now();
    const dt = now - lastKey;
    lastKey = now;
    if (dt > 0 && dt < 25) {
      fastRun += 1;
      if (fastRun === 6) emit("keystroke_anomaly", { gapMs: dt });
    } else {
      fastRun = 0;
    }
  };

  // Heuristics polled on a timer; each fires at most once per session.
  let multiMonitorFired = false;
  let devtoolsFired = false;
  const poll = () => {
    if (!multiMonitorFired && window.outerWidth > window.screen.availWidth + 1) {
      multiMonitorFired = true;
      emit("multi_monitor");
    }
    const gap = 160;
    if (
      !devtoolsFired &&
      (window.outerWidth - window.innerWidth > gap ||
        window.outerHeight - window.innerHeight > gap)
    ) {
      devtoolsFired = true;
      emit("devtools_open");
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("copy", onCopy);
  document.addEventListener("paste", onPaste);
  document.addEventListener("keydown", onKeydown);
  const pollTimer = window.setInterval(poll, 2000);
  const flushTimer = window.setInterval(flush, flushMs);

  return function stop() {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("paste", onPaste);
    document.removeEventListener("keydown", onKeydown);
    window.clearInterval(pollTimer);
    window.clearInterval(flushTimer);
    flush(true); // final unload flush — keepalive so it survives page teardown
  };
}
