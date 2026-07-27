"use client";

import { useEffect, useRef, useState } from "react";

// Advisory per-section countdown. Returns `mm:ss` (or null when no limit) and fires
// `onExpire` once at zero. The backend delivery time-limit stays authoritative; this
// is UX only — it nudges + auto-submits so a candidate isn't stranded watching a
// timer they can't see end.
//
// Uses Date.now()-based math (deadline = start + budget), NOT a decrementing
// setInterval. Browser timers throttle heavily on inactive tabs (up to once/minute)
// and drift under CPU load — a decrementing approach would show a candidate 12:00
// left when the wall-clock deadline is already past. Polling twice a second corrects
// itself on every tick, so a foregrounded tab converges within 500ms.
//
// `seconds` is the total budget; pass `undefined`/0 to disable. `onExpire` is read
// from a ref so a changing callback identity doesn't reset the timer.
export function useCountdown(
  seconds: number | undefined,
  onExpire: () => void,
): string | null {
  const [remaining, setRemaining] = useState<number | null>(
    seconds && seconds > 0 ? seconds : null,
  );
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!seconds || seconds <= 0) return;
    const deadline = Date.now() + seconds * 1000;
    setRemaining(seconds);
    firedRef.current = false;

    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
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

  if (remaining === null) return null;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
