"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 → `target` with an ease-out-cubic curve over `durationMs`.
 *
 * Renders the final value INSTANTLY when `prefers-reduced-motion` is set — the global
 * reduced-motion CSS rule only zeroes CSS animations/transitions, not JS-driven counts,
 * so we check the media query here. Uses requestAnimationFrame and cleans up on unmount /
 * target change. SSR-safe: first render is 0 (matches the server), then it animates on mount.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}
