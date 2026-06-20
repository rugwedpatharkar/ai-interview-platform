"use client";

import { useEffect, useRef, useState } from "react";

// Advisory per-section countdown. Returns `mm:ss` (or null when no limit) and fires `onExpire`
// once at zero. The backend delivery time-limit stays authoritative; this is UX only — it
// nudges + auto-submits so a candidate isn't stranded watching a timer they can't see end.
//
// `seconds` is the total budget; pass `undefined`/0 to disable. `onExpire` is read from a ref
// so a changing callback identity doesn't reset the timer.
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
    setRemaining(seconds);
    firedRef.current = false;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        const next = (r ?? seconds) - 1;
        if (next <= 0) {
          window.clearInterval(id);
          if (!firedRef.current) {
            firedRef.current = true;
            expireRef.current();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  if (remaining === null) return null;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
