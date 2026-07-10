"use client";

import { useEffect } from "react";

/**
 * Vibrant spectral "blush" that trails the cursor across the app (smoothed via
 * rAF lerp). Mounted once app-wide. pointer-events:none, reduced-motion-safe,
 * skipped on touch (no cursor). All styling lives in globals.css (.cursor-glow).
 */
export function CursorGlow() {
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    )
      return;

    const el = document.createElement("div");
    el.className = "cursor-glow";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.4;
    let x = tx;
    let y = ty;
    let raf = 0;
    let shown = false;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        el.style.opacity = "1";
      }
    };
    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      el.remove();
    };
  }, []);

  return null;
}
