"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApertureLens } from "@ip/ui";

// Lucent v4 landing — faithful 1:1 recreation of docs/brand/redesign-v4/D5-lucent.html.
// Content/data behavior preserved: search → /jobs, real auth + audience links. Light-only.
// The extra informative sections (journey, privacy, sample report, FAQ) are re-added
// restyled in follow-up; this is the D5 core.

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

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function ApplicantsLanding() {
  const router = useRouter();
  const [hiring, setHiring] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const forkRef = useRef<HTMLDivElement>(null);
  const jobBtn = useRef<HTMLButtonElement>(null);
  const hireBtn = useRef<HTMLButtonElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  // Slide the fork pill under the selected tab (measured, so it fits each label).
  useLayoutEffect(() => {
    const el = hiring ? hireBtn.current : jobBtn.current;
    const p = pill.current;
    const f = forkRef.current;
    if (!el || !p || !f) return;
    p.style.width = `${el.offsetWidth}px`;
    p.style.transform = `translateX(${el.offsetLeft - 5}px)`;
  }, [hiring]);

  // Scroll reveal — visible by default; arm the hidden state + observe only when
  // motion is allowed, so JS-off / prerender / reduced-motion never gate content.
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
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (hiring) return router.push("/hiring-teams");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="lucent" ref={rootRef}>
      <div className="bg-field" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="nav-outer">
        <div className="wrap">
          <nav className="nav" aria-label="Primary">
            <Link className="brand" href="/" aria-label="Aptura — home"><AptMark spin />Aptura</Link>
            <div className="nav-links">
              <Link href="/hiring-teams">For companies</Link>
              <a href="#how">How it works</a>
              <Link href="/login">Sign in</Link>
            </div>
            <div className="nav-cta">
              <Link href="/register" className="btn btn-primary btn-sm">Get started</Link>
            </div>
          </nav>
        </div>
      </div>

      <main id="top">
        {/* HERO */}
        <section className="hero" aria-labelledby="hero-h1">
          <div className="wrap">
            <div className="hero-inner">
              <ApertureLens />

              <div className="float-chip glass irid-edge fc-1 float-anim" aria-hidden="true">
                <div className="n">100%</div><div className="t">of applications answered</div>
              </div>
              <div className="float-chip glass irid-edge fc-2 float-anim" aria-hidden="true">
                <div className="n">3-day</div><div className="t">average feedback</div>
              </div>

              <div className="hero-content">
                <span className="eyebrow"><span className="dot" aria-hidden="true" /><span>Unified hiring platform</span></span>
                <h1 id="hero-h1" className="hero">Get seen. Get interviewed. Get hired.</h1>
                <p className="lede">One place to apply, interview, and hear back — on a result you can trust.</p>

                <div className="fork" role="tablist" aria-label="Choose your path" ref={forkRef}>
                  <div className="fork-pill" ref={pill} aria-hidden="true" />
                  <button ref={jobBtn} role="tab" aria-selected={!hiring} type="button" onClick={() => setHiring(false)}>I&apos;m looking for a job</button>
                  <button ref={hireBtn} role="tab" aria-selected={hiring} type="button" tabIndex={hiring ? 0 : -1} onClick={() => setHiring(true)}>I&apos;m hiring</button>
                </div>

                <form className="search glass irid-edge" role="search" aria-label="Search roles" onSubmit={onSearch}>
                  <div className="field">
                    <span className="fi" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg></span>
                    <label className="sr-only" htmlFor="q">{hiring ? "Role you're hiring for" : "Job title or skill"}</label>
                    <input id="q" value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder={hiring ? "Role you're hiring for" : "Job title or skill"} autoComplete="off" />
                  </div>
                  <div className="field">
                    <span className="fi" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></svg></span>
                    <label className="sr-only" htmlFor="loc">Location</label>
                    <input id="loc" value={loc} onChange={(e) => setLoc(e.target.value)} type="text" placeholder="Location" autoComplete="off" />
                  </div>
                  <button className="btn btn-primary" type="submit">{hiring ? "Start hiring" : "Search"}</button>
                </form>

                <div className="pills">
                  <span className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>Free for candidates</span>
                  <span className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.4" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Proctored &amp; fair — same rules for everyone</span>
                  <span className="pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" /></svg>Every application gets an answer</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="section-pad" aria-label="Aptura by the numbers">
          <div className="wrap">
            <div className="stats seq">
              {[["100%", "of applications answered"], ["12,400+", "interviews completed"], ["1", "fair interview, live video + voice"], ["3-day", "average feedback"]].map(([n, t]) => (
                <div className="stat glass irid-edge reveal" key={t}><div className="n">{n}</div><div className="t">{t}</div><span className="cap" /></div>
              ))}
            </div>
          </div>
        </section>

        {/* WHY */}
        <section className="section-pad" id="why" aria-labelledby="why-h">
          <div className="wrap">
            <div className="head-row"><h2 id="why-h" className="reveal section-head">The hiring platform that doesn&apos;t ghost you — and gives a result you can trust.</h2></div>
            <div className="why-grid seq">
              <article className="why-card glass irid-edge reveal">
                <span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" /><path d="m9 10 2 2 4-4" /></svg></span>
                <h3>Answered, always</h3><p>Every application gets a real response — no ghosting, ever.</p>
              </article>
              <article className="why-card glass irid-edge reveal">
                <span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg></span>
                <h3>Cheat-proof</h3><p>A rigorously proctored interview — same rules for everyone — so a pass means something.</p>
              </article>
              <article className="why-card glass irid-edge reveal">
                <span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M5.5 5.5 8 8M18.5 5.5 16 8" /><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13h16l-2 6H6Z" /></svg></span>
                <h3>On merit</h3><p>Judged on evidence from the interview, not pedigree or who you know.</p>
              </article>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section className="section-pad" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <div className="head-row"><h2 id="how-h" className="reveal section-head">From &ldquo;apply&rdquo; to &ldquo;you&apos;re hired&rdquo; — in four steps.</h2></div>
            <div className="steps seq">
              {[["1", "Search & apply", "Find roles that fit and apply in a click."], ["2", "Take your live interview", "A single proctored live video + voice interview — same for everyone."], ["3", "Get evidence-based feedback", "See how you did, grounded in what you actually said."], ["4", "Hear back, always", "A real answer on every application."]].map(([num, h, p]) => (
                <article className="step glass irid-edge reveal" key={num}>
                  <span className="step-n"><span className="num">{num}</span><span className="of">/ 04</span></span>
                  <h3>{h}</h3><p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* MERIT */}
        <section className="section-pad" id="merit" aria-labelledby="merit-h">
          <div className="wrap">
            <div className="head-row">
              <h2 id="merit-h" className="reveal section-head">A fair shot you can actually see.</h2>
              <p className="section-lede reveal">No black-box verdicts — here is exactly how a decision gets made.</p>
            </div>
            <div className="merit-panel glass irid-edge reveal">
              <div className="flow seq">
                <div className="node reveal">
                  <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M15 4v5h5" /><path d="M9 13h6M9 16h4" /></svg></span>
                  <div><h3>Evidence captured</h3><p>Your live interview, recorded fairly.</p></div><span className="tag">Input</span>
                </div>
                <div className="arrow reveal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
                <div className="node reveal">
                  <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="7" width="14" height="12" rx="2.4" /><path d="M9 2v3M15 2v3M9 12h6M9 15h4" /><circle cx="12" cy="4" r="0.6" fill="currentColor" /></svg></span>
                  <div><h3>AI structures it</h3><p>Turned into clear, comparable signal.</p></div><span className="tag">Structure</span>
                </div>
                <div className="arrow reveal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
                <div className="node key reveal">
                  <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg></span>
                  <div><h3>A human decides</h3><p>A person makes the call — not a machine.</p></div><span className="tag">Decision</span>
                </div>
                <div className="arrow reveal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
                <div className="node reveal">
                  <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" /><path d="M10.5 21a1.8 1.8 0 0 0 3 0" /></svg></span>
                  <div><h3>You&apos;re notified</h3><p>A real answer lands — every time.</p></div><span className="tag">Result</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AUDIENCES */}
        <section className="section-pad" id="audiences" aria-label="For candidates and companies">
          <div className="wrap">
            <div className="aud">
              <article className="aud-card candidate glass-2 glass irid-edge reveal">
                <span className="aud-glow" aria-hidden="true" />
                <div><span className="kicker">For candidates</span><h3 className="display">Your shot, in focus.</h3></div>
                <div className="aud-feats">
                  <div className="feat"><span className="fic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2.4" /></svg></span>Live video + voice interview</div>
                  <div className="feat"><span className="fic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 12 3 3 5-6" /><circle cx="12" cy="12" r="9" /></svg></span>Private practice runs</div>
                  <div className="feat"><span className="fic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg></span>Skill-gap feedback</div>
                  <div className="feat"><span className="fic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg></span>Real-time application status</div>
                </div>
                <Link href="/jobs" className="aud-cta">Find your next job <Arrow /></Link>
              </article>
              <article className="aud-card company glass irid-edge reveal">
                <span className="aud-glow" aria-hidden="true" />
                <div><span className="kicker">For companies</span><h3 className="display">Hire on evidence.</h3></div>
                <div className="aud-feats">
                  <div className="feat"><span className="fic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13a8 8 0 0 1 16 0" /><path d="M12 3v3" /><path d="M4 13h16l-2 6H6Z" /></svg></span>Merit-based screening</div>
                  <div className="feat"><span className="fic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.2" /><path d="M6 20a6 6 0 0 1 12 0" /></svg></span>Advisory gate — you decide</div>
                  <div className="feat"><span className="fic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M15 4v5h5M9 13h6M9 16h4" /></svg></span>Evidence-based reports</div>
                  <div className="feat"><span className="fic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15l3-3 2 2 4-5" /></svg></span>No-ghosting analytics</div>
                </div>
                <Link href="/hiring-teams" className="aud-cta">Start hiring on merit <Arrow /></Link>
              </article>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="section-pad" id="trust" aria-labelledby="trust-h">
          <div className="wrap">
            <div className="trust-inner">
              <div className="head-row" style={{ margin: 0, justifyItems: "center", textAlign: "center" }}><h2 id="trust-h" className="reveal">Built to be trusted.</h2></div>
              <div className="badges seq">
                <span className="badge reveal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6Z" /></svg>SOC 2</span>
                <span className="badge reveal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3a15 15 0 0 0 0 18M12 3a15 15 0 0 1 0 18M3.5 9h17M3.5 15h17" /></svg>GDPR-ready</span>
                <span className="badge reveal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 7v5c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V7Z" /><path d="m9 12 2 2 4-4" /></svg>EEOC-aligned</span>
                <span className="badge reveal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M5.5 5.5 8 8M18.5 5.5 16 8M4 13a8 8 0 0 1 16 0" /><path d="M4 13h16l-2 6H6Z" /></svg>Bias-tested</span>
                <span className="badge reveal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.4" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" /></svg>Proctored integrity</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="foot">
            <span className="brand" style={{ fontSize: "1.1rem" }}><AptMark size={26} />Aptura</span>
            <div className="foot-right">
              <span>Get seen. Get interviewed. Get hired.</span>
              <span>© Aptura</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
