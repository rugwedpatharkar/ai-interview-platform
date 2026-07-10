"use client";

import { useEffect, useRef } from "react";

import { cn } from "./cn.js";

/**
 * D5 "Lucent" aperture lens — a decorative 3D hero centerpiece.
 *
 * Markup + geometry are a verbatim port of the D5-lucent mockup's `.lens-stage`
 * block; the pointer-parallax is a port of its `<script>` rAF-lerp that writes
 * `--rx`/`--ry` onto `.lens`. All styling lives in `globals.css`.
 *
 * Motion is client-only (effect), SSR-safe, and gated on `prefers-reduced-motion`
 * — under reduced motion the effect is skipped and CSS holds the lens static.
 * A gentle idle drift keeps the lens alive when the pointer is absent.
 */
export function ApertureLens({ className }: { className?: string }) {
  const lensRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lens = lensRef.current;
    if (!lens) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // CSS holds the static state.

    // pointer target (deg) when active, idle sine-drift otherwise
    let px = 0;
    let py = 0;
    let hasPointer = false;
    let cx = 0; // current, lerped
    let cy = 0;
    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const tx = hasPointer ? px : Math.sin(t * 0.5) * 5;
      const ty = hasPointer ? py : Math.cos(t * 0.4) * 4;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      lens.style.setProperty("--rx", `${cx.toFixed(2)}deg`);
      lens.style.setProperty("--ry", `${(-cy).toFixed(2)}deg`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth - 0.5) * 20; // up to ~±10deg
      py = (e.clientY / window.innerHeight - 0.5) * 20;
      hasPointer = true;
    };
    const onLeave = () => {
      hasPointer = false; // ease back into the idle drift
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className={cn("lens-stage", className)} aria-hidden="true">
      <div className="lens" ref={lensRef}>
        <div className="lens-glow" />

        {/* FAR: soft-focus outer scale ring */}
        <div className="lens-layer lens-far">
          <svg viewBox="0 0 400 400">
            <circle className="ticks" cx="200" cy="200" r="192" />
            <circle className="ring" cx="200" cy="200" r="178" strokeWidth="1" />
          </svg>
        </div>

        {/* MID: rings + iris blades + hexagon opening */}
        <div className="lens-layer lens-mid">
          <svg viewBox="0 0 400 400">
            <defs>
              <radialGradient id="core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--lens-core)" stopOpacity="0.95" />
                <stop offset="42%" stopColor="var(--lens-core)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--lens-core)" stopOpacity="0" />
              </radialGradient>
              {/* one aperture blade; curved inner edge for a leaf feel */}
              <path id="blade" d="M200,142 Q223,164 250.19,171 L329.9,125 A150,150 0 0 0 200,50 Z" />
            </defs>

            <circle className="ring-strong" cx="200" cy="200" r="152" strokeWidth="1.4" />
            <circle className="ring" cx="200" cy="200" r="150" strokeWidth="6" strokeOpacity="0.10" />
            <circle className="ring" cx="200" cy="200" r="120" strokeWidth="1" />

            {/* rotating iris */}
            <g className="iris">
              <use href="#blade" className="blade" />
              <use href="#blade" className="blade" transform="rotate(60 200 200)" />
              <use href="#blade" className="blade" transform="rotate(120 200 200)" />
              <use href="#blade" className="blade" transform="rotate(180 200 200)" />
              <use href="#blade" className="blade" transform="rotate(240 200 200)" />
              <use href="#blade" className="blade" transform="rotate(300 200 200)" />
              {/* blade seams */}
              <g className="seam">
                <line x1="200" y1="142" x2="200" y2="50" />
                <line x1="250.19" y1="171" x2="329.9" y2="125" />
                <line x1="250.19" y1="229" x2="329.9" y2="275" />
                <line x1="200" y1="258" x2="200" y2="350" />
                <line x1="149.81" y1="229" x2="70.1" y2="275" />
                <line x1="149.81" y1="171" x2="70.1" y2="125" />
              </g>
              {/* hexagonal opening */}
              <path className="hex" d="M200,142 L250.19,171 L250.19,229 L200,258 L149.81,229 L149.81,171 Z" />
            </g>

            {/* luminous core */}
            <circle cx="200" cy="200" r="70" fill="url(#core)" />
            <circle className="core-ring" cx="200" cy="200" r="34" strokeOpacity="0.7" />
          </svg>
        </div>

        {/* iridescent rim */}
        <div className="lens-rim">
          <div className="lens-rim-spin" />
        </div>

        {/* FRONT: focus reticle + catchlight */}
        <div className="lens-layer lens-front">
          <svg viewBox="0 0 400 400">
            <g className="reticle reticle-spin">
              {/* corner brackets */}
              <path d="M92,64 h-24 v24" />
              <path d="M308,64 h24 v24" />
              <path d="M92,336 h-24 v-24" />
              <path d="M308,336 h24 v-24" />
              {/* cardinal ticks */}
              <line x1="200" y1="46" x2="200" y2="62" />
              <line x1="200" y1="338" x2="200" y2="354" />
              <line x1="46" y1="200" x2="62" y2="200" />
              <line x1="338" y1="200" x2="354" y2="200" />
            </g>
            <circle cx="200" cy="200" r="6" fill="var(--lens-core)" />
          </svg>
        </div>
      </div>
    </div>
  );
}
