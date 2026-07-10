"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApertureLens } from "@ip/ui";

// Candidate HERO + marketing sections for the consolidated Lucent landing. Moved
// verbatim out of applicants-landing.tsx; the `.lucent` shell (nav, bg-field,
// grain, footer) and the scroll-reveal observer now live in landing-page.tsx.

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

const Check = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
);
const Lock = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.4" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
);
const Shield = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg>
);
const User = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
);

// ── Section data (verbatim from the applicants marketing components) ──────────
const JOURNEY: { step: string; n: string; title: string; body: string; bullets: string[] }[] = [
  { step: "Step 01", n: "1.0", title: "Browse roles you fit", body: "Search a verified marketplace of open roles. Save what's interesting, set alerts for what matches, every applicant gets the same view.", bullets: ["Open marketplace, no paywall", "Save jobs, set alerts", "Same criteria as everyone else"] },
  { step: "Step 02", n: "2.0", title: "Apply once", body: "One profile, every role. Your résumé, your skills, your preferences — submit to any open role with one tap.", bullets: ["One profile, every role", "ID verified once, reused", "Track every application in one place"] },
  { step: "Step 03", n: "3.0", title: "Practice for free", body: "Sit a full practice round before any real interview. Same UI, same rubric, no scoring against you. Practice is detached from the funnel — nothing here reaches a recruiter.", bullets: ["Same UI as the real interview", "No scoring against you", "Growth feedback after"] },
  { step: "Step 04", n: "4.0", title: "Sit one proctored interview", body: "Live video and voice with Iris, our AI interviewer. Fullscreen-locked. Camera and mic stay on by design. Same standard for every applicant.", bullets: ["~20 minutes; you'll see the duration upfront", "On-device detection only — no raw media leaves your browser", "Accommodations are first-class"] },
  { step: "Step 05", n: "5.0", title: "Get a real answer + the report behind it", body: "Every applicant — advanced or not — receives an outcome with a competency-level note, the recommendation reason, and an option to request a re-score for a different role.", bullets: ["A named human reviewer signs every outcome", "You see the evidence behind the decision", "Re-score for new roles, same evidence"] },
];

const PROMISE: [string, string][] = [
  ["You'll know", "An outcome message lands. Always."],
  ["With a real reason", "Never silence. Never form-letters."],
  ["The same way for everyone", "Same rubric, same evidence, same review."],
];

const PRACTICE_BULLETS = [
  "Same interviewer (Iris), same question style, same proctoring",
  "Growth feedback only — no hire/reject verdict, ever",
  "Take it as many times as you want, on any topic",
];

const COMPETENCIES: { name: string; score: string; pct: number; quote: string; stamp: string }[] = [
  { name: "Problem framing", score: "4.2 / 5", pct: 84, quote: 'The brief said "make checkout faster," but the actual constraint was returning users on flaky connections — so we reframed the problem as perceived speed and optimistic UI, not raw latency.', stamp: "Transcript · 00:08:11" },
  { name: "Communication", score: "4.5 / 5", pct: 90, quote: "Let me restate that so I'm sure — you're asking how I'd defend the decision to engineering after we'd already shipped, not before.", stamp: "Transcript · 00:21:02" },
  { name: "Tradeoff reasoning", score: "3.8 / 5", pct: 76, quote: "I'd trade a 200ms performance win for WCAG AA every time on a public-facing flow — the accessibility regression is a permanent cost; the perf win we can claw back at the edge.", stamp: "Transcript · 00:14:38" },
  { name: "Domain knowledge", score: "4.1 / 5", pct: 82, quote: "When we picked Postgres for the audit log, the deciding factor wasn't writes/sec — it was that we could prove the chain of custody with a single SELECT.", stamp: "Transcript · 00:18:22" },
  { name: "Decision quality", score: "4.0 / 5", pct: 80, quote: "Once we had three engineers asking the same clarifying question in week one, I knew the spec was the bug, not them. I rewrote the spec before adding any more code.", stamp: "Transcript · 00:23:47" },
  { name: "Integrity (collaboration)", score: "4.6 / 5", pct: 92, quote: "I shipped the bug-fix that night — but I also wrote the post-mortem the next morning. The post-mortem is what kept us from doing the same thing again two months later.", stamp: "Transcript · 00:26:55" },
];

const EVENTS: { sev: "l" | "m"; flag?: boolean; stamp: string; ttl: string; body: string; clip: string }[] = [
  { sev: "l", stamp: "00:01:42 · LOW", ttl: "Background voice (single)", body: "One non-candidate voice detected briefly — below the second-voice threshold.", clip: "Reason · Single short utterance, <2s. Treated as ambient noise. No action." },
  { sev: "m", flag: true, stamp: "00:09:18 · MEDIUM", ttl: "Fullscreen exit (24 seconds)", body: "Candidate left fullscreen for 24 seconds and returned. Surfaced to reviewer.", clip: "Clip · 00:09:14 → 00:09:42 · Reviewer to inspect. No auto-action." },
  { sev: "l", stamp: "00:23:51 · LOW", ttl: "Gaze drift to corner", body: "Gaze tracked off-frame for 1.8s. Within normal interview range.", clip: "Reason · Below threshold. No action." },
];

const PRIVACY: [string, string][] = [
  ["No real-time human watcher.", "Reviewers only see flagged events, after the fact."],
  ["No raw video or audio leaves the browser.", "Detectors run on-device; only typed events are sent."],
  ["No emotion or affect inference.", '"Candidate looked stressed" scoring? Never.'],
  ["No identity matching beyond the ID check.", "No voiceprints, no face match against other databases."],
  ["No keystroke surveillance for content.", "We track tab-switches, not what you type elsewhere."],
  ["Encrypted at rest. Deleted on request.", "Right-to-erase honored across every Aptura artifact."],
];

const ACCOMMODATIONS: [string, string][] = [
  ["Extended time", "Up to 1.5× or 2× the standard interview duration, depending on documented need. Same rubric, same evidence, longer window."],
  ["Captions for the AI interviewer", "Live captions are on by default; you can toggle them off if they aren't helpful."],
  ["Screen-reader-friendly question delivery", "Questions appear as text in addition to being spoken. Skip-to-text shortcuts available."],
  ["Alternative response modes", "If voice response is not possible, written answers in a structured editor are accepted, with the same rubric applied."],
];

const FAQ: { q: string; a: string }[] = [
  { q: "Will a real person watch me during the interview?", a: "No. There is no real-time human watcher. Detectors run on your device; only typed events are sent. Reviewers only see flagged events, after the fact, with the recording encrypted at rest." },
  { q: "What if I have a disability or need an accommodation?", a: "Accommodations are first-class. Extended time, captions, screen-reader-friendly question delivery, and alternative response modes are all available at request — they do not affect your score or appear in your report." },
  { q: "Can I retake the interview if my connection drops?", a: "Yes. Connection drops are not penalised. If a session is interrupted unexpectedly, you'll get a one-tap re-entry and a fresh recording — without losing prior responses." },
  { q: "Will I get feedback even if I'm not advanced?", a: "Yes. Every applicant — advanced or not — receives an outcome message with a competency-level note, the recommendation reason, and an option to request a re-score for a different role." },
  { q: "Does Aptura analyse my face for emotion?", a: "No. We do not infer emotion, affect, or personality from your face or voice. We detect presence, identity match, and proctoring signals — never feelings." },
  { q: "Can I practice before the real interview?", a: "Yes. A full practice round mirrors the real one — same UI, same rubric, no scoring against you. You'll see exactly what's being evaluated before you sit the real interview." },
  { q: "I don't have a webcam. Can I still apply?", a: "A working camera and microphone are required for the proctored interview by design. We'll guide you through low-bandwidth and mobile options. Accommodations are honored." },
  { q: "How long is the interview?", a: "Most Aptura interviews run between 18 and 35 minutes — sized to the rubric for the role. You'll see the expected duration before you start, and there are no surprise rounds." },
  { q: "What happens to my interview recording afterwards?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
  { q: "Can I see what hiring teams see about me?", a: "Yes — every Aptura report includes the evidence and the reason behind the recommendation. The sample report above is the same template every applicant gets." },
];

export function CandidateBody() {
  const router = useRouter();
  const [hiring, setHiring] = useState(false);
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

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (hiring) return router.push("/hiring-teams");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
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

      {/* INTERVIEW HUD — folds in the applicants-hero showcase */}
      <section className="section-pad" id="interview" aria-labelledby="interview-h">
        <div className="wrap">
          <div className="showcase">
            <div className="reveal">
              <span className="label">The interview you&apos;ll sit</span>
              <h2 id="interview-h" className="section-head" style={{ marginTop: 14 }}>The interview you&apos;ll sit.</h2>
              <p className="lede" style={{ marginTop: 16 }}>One fair, proctored AI interview. Always hear back — with a real answer and a reason. Aptura is hiring decided on merit.</p>
              <div className="feats">
                <span><Shield size={16} /> No real-time human watcher</span>
                <span><Check size={16} /> Every applicant gets a real answer</span>
                <span><User size={16} /> Free practice round, no scoring</span>
              </div>
            </div>
            <div className="hud glass irid-edge reveal" aria-label="Sample proctored interview UI (your view)">
              <div className="hud-top">
                <span className="t">Sample interview · Your view</span>
                <span className="m">· demo HUD</span>
                <span className="lock"><Lock size={13} /> Fullscreen locked</span>
              </div>
              <div className="hud-stage">
                <span className="who"><span className="live" /> Iris · AI Interviewer</span>
                <span className="timer mono">14:38</span>
                <div className="self" aria-hidden="true" />
                <div className="hud-cap"><b>Iris</b>Walk me through a tradeoff you made between speed and accessibility on your last project. Take your time.</div>
              </div>
              <div className="hud-strip">
                <div className="hud-chip"><span className="l">Face</span><span className="v">One</span></div>
                <div className="hud-chip"><span className="l">Gaze</span><span className="v">On</span></div>
                <div className="hud-chip"><span className="l">Mic</span><span className="v">Live</span></div>
                <div className="hud-chip"><span className="l">Integrity</span><span className="v">98</span></div>
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

      {/* JOURNEY */}
      <section className="section-pad" id="journey" aria-labelledby="journey-h">
        <div className="wrap">
          <div className="head-row">
            <span className="label reveal">Your journey</span>
            <h2 id="journey-h" className="section-head reveal">Apply once. Sit one fair interview. Always hear back.</h2>
            <p className="section-lede reveal">Five steps from the moment you find a role to the moment a hiring team decides. Every step is observable. Every step is the same for every applicant.</p>
          </div>
          <div className="journey seq">
            {JOURNEY.map((act) => (
              <article className="j-row glass irid-edge reveal" key={act.n}>
                <div><span className="j-step">{act.step}</span><span className="j-n">{act.n}</span></div>
                <div><h3>{act.title}</h3><p className="j-body">{act.body}</p></div>
                <div className="j-bullets">
                  <ul className="checks">{act.bullets.map((b) => <li key={b}><Check size={15} />{b}</li>)}</ul>
                </div>
              </article>
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

      {/* NO-GHOSTING PROMISE */}
      <section className="section-pad" aria-labelledby="promise-h">
        <div className="wrap">
          <div className="panel glass irid-edge reveal">
            <span className="label">The promise</span>
            <h2 id="promise-h" className="section-head" style={{ marginTop: 14 }}>Every applicant gets a real answer. With feedback.</h2>
            <p className="lede" style={{ marginTop: 16 }}>Aptura was built so résumé black holes stop happening. If you sit an Aptura interview, you hear back — with a reason, with the evidence behind it, the same way for every applicant.</p>
            <div className="info-3 seq" style={{ marginTop: 28 }}>
              {PROMISE.map(([head, sub]) => (
                <div className="mini reveal" key={head}><h4>{head}</h4><p>{sub}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRACTICE SPOTLIGHT */}
      <section className="section-pad" aria-labelledby="practice-h">
        <div className="wrap">
          <div className="panel split glass irid-edge reveal">
            <div>
              <span className="label">Practice mode</span>
              <h2 id="practice-h" className="section-head" style={{ marginTop: 14 }}>Sit a full practice round. Free. No scoring.</h2>
              <p className="lede" style={{ marginTop: 16 }}>The same UI as the real interview. The same rubric. Growth feedback after — strengths, gaps, suggested topics. Detached from the funnel; nothing here reaches a recruiter.</p>
              <ul className="checks" style={{ marginTop: 22 }}>
                {PRACTICE_BULLETS.map((b) => <li key={b}><Check size={17} />{b}</li>)}
              </ul>
              <Link href="/practice" className="btn btn-primary" style={{ marginTop: 26 }}>Try a practice round</Link>
            </div>
            <div className="practice-note">Practice runs on the same surface as the real interview — sample preview available after sign-in.</div>
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

      {/* SAMPLE REPORT */}
      <section className="section-pad" id="sample-report" aria-labelledby="report-h">
        <div className="wrap">
          <div className="head-row">
            <span className="label reveal">Sample interview report</span>
            <h2 id="report-h" className="section-head reveal">Same report you can read. Same evidence. No hidden notes.</h2>
          </div>
          <div className="report glass irid-edge reveal">
            <div className="sect rep-head">
              <div className="rep-avatar">SC</div>
              <div>
                <div className="rep-name">Sample candidate</div>
                <div className="rep-sub">Sr. Product Designer · sample report · for illustration</div>
              </div>
              <span className="rep-badge ml">Recommended: Advance</span>
            </div>

            <div className="sect rep-score">
              <div className="ap-ring" style={{ ["--pct" as string]: 86, width: 88, height: 88 }}>
                <span className="ap-ring-v" style={{ fontSize: "1.4rem" }}>86</span>
              </div>
              <div>
                <span className="label">Aptura Score</span>
                <div className="rep-score-h">Strong evidence — Top 12% for this role.</div>
                <p>Candidate demonstrated strong tradeoff reasoning anchored in concrete prior work, clear communication discipline, and consistent rubric coverage. One medium-severity proctoring event surfaced for reviewer attention (see timeline below) — no high-severity events.</p>
              </div>
            </div>

            <div className="sect">
              <h3 style={{ marginBottom: 14 }}>Aptura Core 6 — competency breakdown</h3>
              <div className="comp seq">
                {COMPETENCIES.map((c) => (
                  <article className="comp-card reveal" key={c.name}>
                    <div className="comp-top"><span className="nm">{c.name}</span><span className="sc mono">{c.score}</span></div>
                    <div className="comp-bar"><i style={{ width: `${c.pct}%` }} /></div>
                    <blockquote className="comp-quote"><span className="q" aria-hidden="true">&ldquo;</span>{c.quote}<span className="q" aria-hidden="true">&rdquo;</span></blockquote>
                    <span className="comp-stamp">{c.stamp}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="sect">
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <h3>Integrity timeline</h3>
                <span className="rep-sub">Sample timeline · 28m 12s · for illustration</span>
                <div className="rep-legend">
                  <span><i style={{ background: "var(--good)" }} />Low</span>
                  <span><i style={{ background: "var(--warn)" }} />Medium</span>
                  <span><i style={{ background: "var(--danger)" }} />High · auto-end</span>
                </div>
              </div>
              <div className="ap-itl-track" style={{ marginTop: 16 }} role="img" aria-label="Sample interview integrity timeline">
                <div className="ap-itl-line" />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "6%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "18%" }} />
                <span className="ap-itl-pip ap-itl-pip--m" style={{ left: "32%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "44%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "58%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "71%" }} />
                <span className="ap-itl-pip ap-itl-pip--m" style={{ left: "83%" }} />
                <span className="ap-itl-pip ap-itl-pip--l" style={{ left: "95%" }} />
                <span className="ap-itl-scrubber" style={{ left: "32%" }} />
                <div className="ap-itl-axis"><span>00:00</span><span>07:00</span><span>14:00</span><span>21:00</span><span>28:12</span></div>
              </div>
              <div className="events">
                {EVENTS.map((ev) => (
                  <article className={ev.flag ? "event flag" : "event"} key={ev.stamp}>
                    <div className="st"><i style={{ background: ev.sev === "m" ? "var(--warn)" : "var(--good)" }} /><span>{ev.stamp}</span></div>
                    <h4>{ev.ttl}</h4>
                    <p>{ev.body}</p>
                    <div className="clip">{ev.clip}</div>
                  </article>
                ))}
              </div>
            </div>

            <div className="sect" style={{ background: "var(--surface-glass)" }}>
              <span className="label">Decision</span>
              <div className="rep-decide">
                <div className="who">
                  <div className="dot" />
                  <div><div className="nm">Sample reviewer</div><div className="rl">Hiring Manager · sample workspace</div></div>
                </div>
                <span className="rep-badge ml"><Check size={16} /> Advance · signed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRIVACY — everything we chose not to build */}
      <section className="section-pad" aria-labelledby="privacy-h">
        <div className="wrap">
          <div className="head-row">
            <span className="label reveal">What we didn&apos;t build</span>
            <h2 id="privacy-h" className="section-head reveal">The strongest part of the system is everything we chose not to build.</h2>
          </div>
          <div className="privacy glass irid-edge reveal">
            <h3><Shield size={22} /> What Aptura does <em>not</em> do</h3>
            <ul className="privacy-list seq">
              {PRIVACY.map(([title, rest]) => (
                <li className="reveal" key={title}><Check size={17} /><span><b>{title}</b> {rest}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ACCOMMODATIONS */}
      <section className="section-pad" aria-labelledby="acc-h">
        <div className="wrap">
          <div className="head-row">
            <span className="label reveal">First-class, not a checkbox</span>
            <h2 id="acc-h" className="section-head reveal">Accommodations don&apos;t affect your score, don&apos;t appear in your report.</h2>
            <p className="section-lede reveal">The proctored interview is high-stakes. The accommodations below are honored on request and apply the same rubric — they shape how you sit the interview, not how it&apos;s scored.</p>
          </div>
          <div className="info-2 seq">
            {ACCOMMODATIONS.map(([title, body]) => (
              <article className="mini reveal" key={title}><h4>{title}</h4><p>{body}</p></article>
            ))}
          </div>
          <p className="reveal" style={{ marginTop: 24, color: "var(--ink-2)", fontSize: ".95rem" }}>
            Full statement, and how to request an accommodation: <Link href="/accessibility" className="link">Accessibility <Arrow /></Link>
          </p>
        </div>
      </section>

      {/* Cross-audience "For candidates / For companies" cards removed — content
          bifurcated: this landing is candidate-only, and the nav "For candidates |
          For hiring teams" switch routes to /hiring-teams for the company story. */}

      {/* FAQ */}
      <section className="section-pad" id="faq" aria-labelledby="faq-h">
        <div className="wrap">
          <div className="head-row">
            <span className="label reveal">Questions, answered</span>
            <h2 id="faq-h" className="section-head reveal">What applicants ask first.</h2>
          </div>
          <div className="faq seq">
            {FAQ.map(({ q, a }) => (
              <details className="faq-item glass irid-edge reveal" key={q}>
                <summary className="faq-q">{q}<span className="faq-mark" aria-hidden="true">+</span></summary>
                <div className="faq-a">{a}</div>
              </details>
            ))}
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

      {/* FINAL CTA */}
      <section className="section-pad" id="get-started" aria-labelledby="final-h">
        <div className="wrap">
          <div className="panel glass irid-edge reveal final">
            <span className="label">For applicants</span>
            <h3 id="final-h">Get seen. Get interviewed. Get hired.</h3>
            <p>One fair, proctored interview — and a real answer every time. Practice for free; sit the real round when you&apos;re ready.</p>
            <div className="row">
              <Link href="/jobs" className="btn btn-primary">Find roles</Link>
              <Link href="/hiring-teams" className="txt-link">Hiring instead? See Aptura for hiring teams →</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
