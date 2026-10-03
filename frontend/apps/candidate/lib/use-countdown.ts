"use client";

import { useEffect, useRef, useState } from "react";

/** What `useCountdown` returns — `display` is the `mm:ss` string (null when
 *  no limit), `secondsLeft` is the raw seconds so callers can drive threshold
 *  announcements (5 min, 1 min, 30 s, 10 s) for AT users. */
export interface CountdownState {
  display: string | null;
  secondsLeft: number | null;
}

/** Announce-at thresholds in seconds; each fires ONCE as the timer crosses it. */
const ANNOUNCE_AT_SECS = [300, 60, 30, 10, 0] as const;

/** Human-readable ("5 minutes remaining") for a given threshold. */
function announceLabel(threshold: number): string {
  if (threshold === 0) return "Time's up";
  if (threshold >= 60) {
    const m = threshold / 60;
    return `${m} minute${m === 1 ? "" : "s"} remaining`;
  }
  return `${threshold} seconds remaining`;
}

// Advisory per-section countdown. Returns `{display, secondsLeft}`. The backend
// delivery time-limit stays authoritative; this is UX only — it nudges + auto-
// submits so a candidate isn't stranded watching a timer they can't see end.
//
// Uses Date.now()-based math (deadline = start + budget), NOT a decrementing
// setInterval. Browser timers throttle heavily on inactive tabs (up to once/minute)
// and drift under CPU load — a decrementing approach would show a candidate 12:00
// left when the wall-clock deadline is already past. Polling twice a second corrects
// itself on every tick, so a foregrounded tab converges within 500ms.
//
// `seconds` is the total budget; pass `undefined`/0 to disable. `onExpire` and
// `onAnnounce` are read from refs so a changing callback identity doesn't reset
// the timer.
export function useCountdown(
  seconds: number | undefined,
  onExpire: () => void,
  onAnnounce?: (label: string) => void,
): CountdownState {
  const [remaining, setRemaining] = useState<number | null>(
    seconds && seconds > 0 ? seconds : null,
  );
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const announceRef = useRef(onAnnounce);
  announceRef.current = onAnnounce;
  const firedRef = useRef(false);
  const announcedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!seconds || seconds <= 0) return;
    const deadline = Date.now() + seconds * 1000;
    setRemaining(seconds);
    firedRef.current = false;
    announcedRef.current = new Set();

    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      // Threshold-based AT announcements — fire once as the timer crosses each,
      // ignoring thresholds already above the initial budget (a 20s section
      // doesn't announce "5 minutes remaining").
      for (const t of ANNOUNCE_AT_SECS) {
        if (t > seconds) continue;
        if (left <= t && !announcedRef.current.has(t)) {
          announcedRef.current.add(t);
          announceRef.current?.(announceLabel(t));
        }
      }
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.clearInterval(id);
        expireRef.current();
      }
    };
    // 500ms so the visible mm:ss lags real time by at most half a second.
    const id = window.setInterval(tick, 500);
    // Recompute the moment the tab is refocused so an inactive-tab throttle
    // doesn't leave stale mm:ss on screen while the real deadline moved on.
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);

  if (remaining === null) return { display: null, secondsLeft: null };
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return { display: `${mm}:${ss.toString().padStart(2, "0")}`, secondsLeft: remaining };
}
