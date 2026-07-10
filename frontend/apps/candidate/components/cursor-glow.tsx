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
    let running = false;
    let shown = false;

    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
      // Converged on the target → stop the loop; onMove kicks it back. Keeps rAF
      // at zero whenever the cursor is still (the common case).
      if (Math.abs(tx - x) < 0.5 && Math.abs(ty - y) < 0.5) {
        running = false;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        el.style.opacity = "1";
      }
      kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      el.remove();
    };
  }, []);

  return null;
}
