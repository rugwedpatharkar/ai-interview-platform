"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LogoMark } from "@ip/ui";
import { AudienceSwitch } from "../audience-switch";
import { Arrow, Chevron } from "./landing-icons";

// Lazy-load the two audience bodies — only the shown one ships in the initial JS; the
// other loads on the audience switch. Cuts the landing's component payload (each body is
// large and pulls in the 3D ApertureLens) on first paint.
const CandidateBody = dynamic(() =>
  import("./candidate-body").then((m) => m.CandidateBody),
);
const CompanyBody = dynamic(() =>
  import("./company-body").then((m) => m.CompanyBody),
);

// Single consolidated Lucent landing. Owns the `.lucent` shell (aurora bg-field,
// grain, glass nav, footer) and swaps the audience body IN PLACE when the nav
// switch is clicked — pure client state, NO route navigation and NO URL change.
// There is one landing page; /hiring-teams just resolves here.

const Burger = ({ open }: { open: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    {open ? <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></> : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
  </svg>
);

// Hiring-side "Platform ▾" mega-menu — each item jumps to a real hiring section.
const PLATFORM_ITEMS: { href: string; title: string; desc: string; icon: ReactNode }[] = [
  { href: "#how", title: "The verified interview", desc: "One proctored AI interview per role", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg> },
  { href: "#platform", title: "One joined-up platform", desc: "Marketplace → interview → evidence", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></svg> },
  { href: "#integrity", title: "Integrity timeline", desc: "Severity-stamped proctoring events", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5-7 4 15 2.5-8H21" /></svg> },
  { href: "#evidence", title: "Evidence-based reports", desc: "Every score quotes the transcript", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M15 3v5h5" /><path d="M9 13h6M9 16.5h4" /></svg> },
];

const TRANSITION_MS = 260;

export function LandingPage({ initialAudience }: { initialAudience: "candidates" | "hiring" }) {
  const [audience, setAudience] = useState(initialAudience); // selected — drives the switch highlight
  const [shown, setShown] = useState(initialAudience);       // body currently rendered
  const [leaving, setLeaving] = useState(false);             // mid-crossfade
  const [showBar, setShowBar] = useState(true);              // announcement bar
  const [menuOpen, setMenuOpen] = useState(false);           // mobile hamburger menu
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

  // Close the mobile menu on Escape or when the viewport grows back to desktop.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  // Toggle the body in place with a crossfade — no navigation, no URL change.
  function select(next: "candidates" | "hiring") {
    if (next === audience || leaving) return;
    setMenuOpen(false); // dismiss the mobile menu if the switch was tapped from it
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
          {showBar && (
            <div className="nav-banner" role="region" aria-label="Announcement">
              <span className="nb-in">
                <span className="nb-tag">New</span>
                <span>AI-proctored interviews are live — one fair round, evidence you can trust.</span>
                <a className="nb-link" href={audience === "hiring" ? "#platform" : "#how"}>See how <Arrow size={13} /></a>
              </span>
              <button type="button" className="nb-x" onClick={() => setShowBar(false)} aria-label="Dismiss announcement">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          )}
          <nav className="nav" aria-label="Primary">
            <Link className="brand" href="/" aria-label="Aptura — home"><LogoMark size="md" spin /><span className="brand-tx">Aptura</span></Link>
            <AudienceSwitch active={audience} onSelect={select} />

            {audience === "candidates" ? (
              <div className="nav-links">
                <Link href="/jobs">Find jobs</Link>
                <Link href="/practice">Practice</Link>
                <a href="#how">How it works</a>
              </div>
            ) : (
              <div className="nav-links">
                <div className="nav-mega">
                  <a className="nav-mega-trigger" href="#platform" aria-haspopup="true">Platform <Chevron /></a>
                  <div className="mega-panel" role="menu" aria-label="Platform">
                    {PLATFORM_ITEMS.map((it) => (
                      <a className="mega-item" role="menuitem" href={it.href} key={it.href}>
                        <span className="mega-ic">{it.icon}</span>
                        <span className="mega-tx"><b>{it.title}</b><span>{it.desc}</span></span>
                      </a>
                    ))}
                  </div>
                </div>
                <a href="#why">Why Aptura</a>
                <a href="#pricing">Pricing</a>
              </div>
            )}

            <div className="nav-cta">
              <Link href="/login" className="nav-signin">Sign in</Link>
              {audience === "candidates" ? (
                <Link href="/register" className="btn btn-primary btn-sm">Get started</Link>
              ) : (
                <Link href="/pilot" className="btn btn-primary btn-sm">Book a pilot</Link>
              )}
            </div>

            <button
              type="button"
              className="nav-burger"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Burger open={menuOpen} />
            </button>
          </nav>

          {menuOpen && (
            <div className="nav-menu" id="landing-mobile-menu">
              {audience === "candidates" ? (
                <>
                  <Link href="/jobs" onClick={() => setMenuOpen(false)}>Find jobs</Link>
                  <Link href="/practice" onClick={() => setMenuOpen(false)}>Practice</Link>
                  <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
                </>
              ) : (
                <>
                  <span className="nav-menu-label">Platform</span>
                  {PLATFORM_ITEMS.map((it) => (
                    <a href={it.href} key={it.href} onClick={() => setMenuOpen(false)}>
                      {it.title}
                    </a>
                  ))}
                  <a href="#why" onClick={() => setMenuOpen(false)}>Why Aptura</a>
                  <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
                </>
              )}
              <div className="nav-menu-cta">
                <Link href="/login" className="nav-signin" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
                {audience === "candidates" ? (
                  <Link href="/register" className="btn btn-primary btn-sm" onClick={() => setMenuOpen(false)}>
                    Get started
                  </Link>
                ) : (
                  <Link href="/pilot" className="btn btn-primary btn-sm" onClick={() => setMenuOpen(false)}>
                    Book a pilot
                  </Link>
                )}
              </div>
            </div>
          )}
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
            <span className="brand" style={{ fontSize: "1.1rem" }}><LogoMark size="sm" />Aptura</span>
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
