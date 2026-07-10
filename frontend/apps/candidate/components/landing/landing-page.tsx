"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudienceSwitch } from "../audience-switch";
import { CandidateBody } from "./candidate-body";
import { CompanyBody } from "./company-body";

// Single consolidated Lucent landing. Owns the `.lucent` shell (aurora bg-field,
// grain, glass nav, footer) and swaps the audience body IN PLACE when the nav
// switch is clicked — pure client state, NO route navigation and NO URL change.
// There is one landing page; /hiring-teams just resolves here.

const AptMark = ({ size = 30, spin = false }: { size?: number; spin?: boolean }) => (
  <svg className="mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Aptura">
    <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="3" />
    <g className={spin ? "spin" : undefined} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <line x1="43" y1="32" x2="55.4" y2="45.5" /><line x1="37.5" y1="41.5" x2="32" y2="59" />
      <line x1="26.5" y1="41.5" x2="8.6" y2="45.5" /><line x1="21" y1="32" x2="8.6" y2="18.5" />
      <line x1="26.5" y1="22.5" x2="32" y2="5" /><line x1="37.5" y1="22.5" x2="55.4" y2="18.5" />
    </g>
  </svg>
);

const TRANSITION_MS = 260;

export function LandingPage({ initialAudience }: { initialAudience: "candidates" | "hiring" }) {
  const [audience, setAudience] = useState(initialAudience); // selected — drives the switch highlight
  const [shown, setShown] = useState(initialAudience);       // body currently rendered
  const [leaving, setLeaving] = useState(false);             // mid-crossfade
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll reveal — visible by default; arm + observe only when motion is allowed
  // (JS-off / prerender / reduced-motion never gate content). Keyed on the SHOWN
  // body (it remounts on `shown`) so it re-observes the fresh `.reveal` elements.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("js-reveal");
    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    els.forEach((el) => {
      const seq = el.parentElement?.classList.contains("seq") ? el.parentElement : null;
      if (seq) el.style.transitionDelay = `${Array.from(seq.children).indexOf(el) * 70}ms`;
    });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shown]);

  // Toggle the body in place with a crossfade — no navigation, no URL change.
  function select(next: "candidates" | "hiring") {
    if (next === audience || leaving) return;
    setAudience(next); // switch highlights + footer flip instantly
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(next);
      window.scrollTo(0, 0);
      return;
    }
    setLeaving(true); // fade the current body out
    window.setTimeout(() => {
      setShown(next); // swap while invisible (no flash)
      window.scrollTo(0, 0);
      setLeaving(false); // fade the new body in
    }, TRANSITION_MS);
  }

  return (
    <div className="lucent" ref={rootRef}>
      <div className="bg-field" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="nav-outer">
        <div className="wrap">
          <nav className="nav" aria-label="Primary">
            <Link className="brand" href="/" aria-label="Aptura — home"><AptMark spin />Aptura</Link>
            <AudienceSwitch active={audience} onSelect={select} />
            <div className="nav-links">
              <a href="#how">How it works</a>
              <Link href="/login">Sign in</Link>
            </div>
            <div className="nav-cta">
              <Link href="/register" className="btn btn-primary btn-sm">Get started</Link>
            </div>
          </nav>
        </div>
      </div>

      <div className={leaving ? "landing-body is-leaving" : "landing-body"}>
        <Fragment key={shown}>
          {shown === "candidates" ? <CandidateBody /> : <CompanyBody />}
        </Fragment>
      </div>

      <footer>
        <div className="wrap">
          <div className="foot">
            <span className="brand" style={{ fontSize: "1.1rem" }}><AptMark size={26} />Aptura</span>
            <div className="foot-right">
              <span>{shown === "hiring" ? "Hire on proven merit. Cheat-proof by design." : "Get seen. Get interviewed. Get hired."}</span>
              <span>© Aptura</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
