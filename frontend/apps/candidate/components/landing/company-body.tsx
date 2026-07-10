"use client";

import Link from "next/link";
import { ApertureLens, ApIcon, type ApIconName } from "@ip/ui";
import { PrivacyPanel } from "../marketing/privacy-panel";

// Company (hiring-teams) HERO + marketing sections for the consolidated Lucent
// landing. Moved verbatim out of hiring-teams/page.tsx; the `.lucent` shell (nav,
// bg-field, grain, footer) and the scroll-reveal observer now live in
// landing-page.tsx. Token-driven .ap-* widgets are reused as-is.

// ── Section chrome (Lucent) ──────────────────────────────────────────────────
function Section({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section className="section-pad" id={id}>
      <div className="wrap">{children}</div>
    </section>
  );
}

function Head({
  eyebrow,
  h2,
  lead,
  twoCol,
}: {
  eyebrow: string;
  h2: React.ReactNode;
  lead?: React.ReactNode;
  twoCol?: boolean;
}) {
  if (twoCol) {
    return (
      <div className="head-row head-two reveal">
        <div className="head-two-l">
          <span className="label">{eyebrow}</span>
          <h2 className="section-head">{h2}</h2>
        </div>
        {lead && <p className="section-lede">{lead}</p>}
      </div>
    );
  }
  return (
    <div className="head-row reveal">
      <span className="label">{eyebrow}</span>
      <h2 className="section-head">{h2}</h2>
      {lead && <p className="section-lede">{lead}</p>}
    </div>
  );
}

// ── Evidence-flip helpers ────────────────────────────────────────────────────
function ResumeRow({ y, body, strike, muted }: { y: string; body: string; strike?: boolean; muted?: boolean }) {
  return (
    <div className={`rr${strike ? " strike" : ""}${muted ? " muted" : ""}`}>
      <span className="y">{y}</span>
      <span>{body}</span>
    </div>
  );
}

function BarRow({ name, v, pct }: { name: string; v: string; pct: number }) {
  return (
    <div className="ap-bar">
      <span className="name">{name}</span>
      <span className="v">{v}</span>
      <span className="t"><i style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

// ── How-it-happens mini visuals (token-driven; on-brand inside Lucent) ────────
function KvRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <b className={ok ? "font-semibold text-good" : "font-semibold text-ink-deep"}>{value}</b>
    </div>
  );
}

function MiniIdentity() {
  return (
    <div className="grid w-full grid-cols-[64px_1fr] items-center gap-4">
      <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[color-mix(in_oklch,var(--teal)_35%,var(--surface))] to-[color-mix(in_oklch,var(--teal)_12%,var(--surface))] text-teal">
        <ApIcon name="user" className="size-7" />
      </div>
      <div className="grid gap-1.5 text-[0.82rem] text-ink-2">
        <KvRow label="Government ID match" value="Verified" ok />
        <KvRow label="Selfie liveness" value="Pass" ok />
        <KvRow label="Camera · Mic" value="Live" ok />
        <KvRow label="Environment" value="Clear" ok />
      </div>
    </div>
  );
}

function MiniRoom() {
  return (
    <div className="flex w-full flex-wrap content-start items-start gap-2">
      {["CAM", "MIC", "SCR", "ENV"].map((label) => (
        <div
          key={label}
          className="relative aspect-video flex-[1_1_calc(50%-0.5rem)] overflow-hidden rounded-lg"
          style={{ background: "linear-gradient(135deg, oklch(0.22 0.03 220), oklch(0.12 0.02 230))" }}
        >
          <span className="absolute right-1.5 top-1.5 font-mono text-[0.62rem] text-white/85">{label}</span>
          <span className="absolute bottom-1.5 left-1.5 size-2 rounded-full bg-good" />
        </div>
      ))}
    </div>
  );
}

function MiniTimeline() {
  const pips = [
    { l: 8, sev: "l" as const },
    { l: 24, sev: "l" as const },
    { l: 42, sev: "m" as const },
    { l: 58, sev: "l" as const },
    { l: 70, sev: "l" as const },
    { l: 88, sev: "h" as const },
  ];
  const colorFor = { l: "var(--good)", m: "var(--warn)", h: "var(--danger)" } as const;
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 text-[0.78rem] text-ink-2">
        <span>Integrity</span>
        <span className="ml-auto font-mono text-[0.7rem] tracking-[0.06em] text-ink-3">LOW · MED · HIGH</span>
      </div>
      <div className="relative mt-2.5 h-9 rounded-md border border-line bg-gradient-to-b from-surface to-surface-2">
        {pips.map((p, i) => (
          <span
            key={i}
            className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${p.l}%`,
              background: colorFor[p.sev],
              boxShadow: `0 0 0 2px color-mix(in oklch, ${colorFor[p.sev]} 25%, transparent)`,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[0.66rem] text-ink-3">
        <span>00:00</span><span>10:00</span><span>20:00</span><span>30:00</span>
      </div>
    </div>
  );
}

function MiniRubric() {
  const rows = [
    { name: "Problem framing", pct: 84, v: 4.2 },
    { name: "Communication", pct: 90, v: 4.5 },
    { name: "Tradeoff reasoning", pct: 76, v: 3.8 },
    { name: "Domain knowledge", pct: 82, v: 4.1 },
  ];
  return (
    <div className="grid w-full content-center gap-2">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[1fr_60px_30px] items-center gap-2 text-[0.84rem]">
          <span className="text-ink-2">{r.name}</span>
          <span className="h-[5px] overflow-hidden rounded-full bg-surface-3">
            <i className="block h-full rounded-full bg-teal" style={{ width: `${r.pct}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink-deep">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniDecision() {
  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="size-11 rounded-full bg-gradient-to-br from-coral to-[color-mix(in_oklch,var(--coral)_60%,var(--ink-deep))]" />
      <div className="flex-1">
        <div className="font-semibold text-ink-deep text-[0.92rem]">Hiring Manager</div>
        <div className="text-[0.78rem] text-ink-3">Reviewer · signs the outcome</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md border border-good/40 bg-good/10 px-2 py-1 text-[0.76rem] font-medium text-good">Advance ✓</span>
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[0.76rem] text-ink-2">Hold</span>
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[0.76rem] text-ink-2">Decline</span>
      </div>
    </div>
  );
}

const ACTS: { step: string; n: string; title: string; body: string; bullets: string[]; visual: React.ReactNode }[] = [
  { step: "Step 01", n: "1.0", title: "Invite & identity check", body: "One-tap invite from the marketplace or your ATS. The candidate completes a government-ID match and an environment scan before anything starts.", bullets: ["ID match (government photo)", "Selfie liveness, anti-deepfake", "Device, mic and camera pre-flight"], visual: <MiniIdentity /> },
  { step: "Step 02", n: "2.0", title: "Live, strictly proctored interview", body: "Fullscreen-locked. Camera and mic stay on throughout — there is no mute or camera-off button by design. Iris adapts questions to the role's competencies.", bullets: ["Adaptive question paths from the rubric", "Live caption + transcript", "40-signal proctoring runs on-device"], visual: <MiniRoom /> },
  { step: "Step 03", n: "3.0", title: "Integrity timeline", body: "Every signal is severity-stamped server-side. Low / medium events are surfaced for human review. High-severity events auto-end the session — there is no debate later.", bullets: ["Low / Medium → advisory to your reviewer", "High severity → server-authoritative auto-end", "Every event has a clip and a reason"], visual: <MiniTimeline /> },
  { step: "Step 04", n: "4.0", title: "Evidence-based scoring", body: "The Aptura Core 6 rubric scores each competency on the transcript — every score is backed by a quoted line and a timestamp. No black box.", bullets: ["Quoted transcript backs every rating", "Calibrated against a bias-audited model", "Re-score on demand — same evidence, new lens"], visual: <MiniRubric /> },
  { step: "Step 05", n: "5.0", title: "A human makes the call", body: "Aptura recommends; your hiring manager decides. Every decision is logged with the reviewer's name, the evidence shown, and the reason given.", bullets: ["Advisory mode is the default", "Outcome and feedback to every candidate", "Decision audit kept per outcome (reviewer, evidence, reason)"], visual: <MiniDecision /> },
];

// ── Platform bento helpers (token-driven .ap-cell; reused as-is) ─────────────
function Node({ label, sub, core }: { label: string; sub: string; core?: boolean }) {
  if (core) {
    return (
      <div className="rounded-2xl border border-teal-strong bg-gradient-to-br from-teal to-teal-strong p-4 text-center text-teal-ink shadow-[0_12px_36px_-16px_color-mix(in_oklch,var(--teal)_60%,transparent)]">
        <b className="block text-[1rem] font-semibold text-teal-ink" style={{ fontFamily: "var(--font-display)" }}>{label}</b>
        <span className="text-[0.84rem]">{sub}</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 text-center text-[0.84rem] text-ink-2">
      <b className="mb-0.5 block text-[0.88rem] font-semibold text-ink-deep">{label}</b>
      {sub}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-3">{k}</span>
      <span className="font-semibold text-ink-deep">{v}</span>
    </div>
  );
}

function MatchCard({ name, pct, tone }: { name: string; pct: string; tone: "teal" | "coral" | "gold" }) {
  const avBg = {
    teal: "linear-gradient(135deg, var(--teal), var(--teal-strong))",
    coral: "linear-gradient(135deg, var(--coral), color-mix(in oklch, var(--coral) 60%, var(--ink-deep)))",
    gold: "linear-gradient(135deg, var(--gold), color-mix(in oklch, var(--gold) 50%, var(--ink-deep)))",
  };
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <div className="size-7 rounded-full" style={{ background: avBg[tone] }} />
      <div className="flex-1 text-[0.84rem]">
        <b className="block font-semibold text-ink-deep">{name}</b>
        <span className="text-[0.72rem] text-ink-3">Sr. Product Designer · sample</span>
      </div>
      <span className="font-mono text-[0.84rem] font-semibold text-teal-strong">{pct}</span>
    </div>
  );
}

// ── Integrity-timeline event card (Lucent glass) ─────────────────────────────
function EventCard({ sev, stamp, ttl, body, clip, flag }: { sev: "l" | "m" | "h"; stamp: string; ttl: string; body: string; clip: string; flag?: boolean }) {
  const dot = { l: "var(--good)", m: "var(--warn)", h: "var(--danger)" }[sev];
  return (
    <article className={flag ? "event flag" : "event"}>
      <div className="st"><i style={{ background: dot }} /><span>{stamp}</span></div>
      <h4>{ttl}</h4>
      <p>{body}</p>
      <div className="clip">{clip}</div>
    </article>
  );
}

// ── Evidence-report competency card (Lucent glass) ───────────────────────────
function Competency({ name, score, pct, quote, stamp }: { name: string; score: string; pct: number; quote: string; stamp: string }) {
  return (
    <article className="comp-card" style={{ marginTop: 14 }}>
      <div className="comp-top"><span className="nm">{name}</span><span className="sc mono">{score}</span></div>
      <div className="comp-bar"><i style={{ width: `${pct}%` }} /></div>
      <blockquote className="comp-quote"><span className="q" aria-hidden="true">&ldquo;</span>{quote}<span className="q" aria-hidden="true">&rdquo;</span></blockquote>
      <span className="comp-stamp">{stamp}</span>
    </article>
  );
}

const REPORT_COMPS = [
  { name: "Tradeoff reasoning", score: "3.8 / 5", pct: 76, quote: "I'd trade a 200ms performance win for WCAG AA every time on a public-facing flow — the accessibility regression is a permanent cost; the perf win we can claw back at the edge.", stamp: "Transcript · 00:14:38 — verbatim, time-stamped, untouched." },
  { name: "Problem framing", score: "4.2 / 5", pct: 84, quote: 'The brief said "make checkout faster," but the actual constraint was returning users on flaky connections — so we reframed the problem as perceived speed and optimistic UI, not raw latency.', stamp: "Transcript · 00:08:11 — verbatim, time-stamped, untouched." },
  { name: "Communication", score: "4.5 / 5", pct: 90, quote: "Let me restate that so I'm sure — you're asking how I'd defend the decision to engineering after we'd already shipped, not before.", stamp: "Transcript · 00:21:02 — verbatim, time-stamped, untouched." },
];

const REPORT_POINTS: [string, string][] = [
  ["The Aptura Core 6", "— Problem framing · Communication · Domain knowledge · Tradeoff reasoning · Decision quality · Integrity. Published and versioned."],
  ["Quoted evidence per score.", "Disagree with the rating? The proof is right there."],
  ["Re-score on demand.", "New role, new lens — same evidence, recalculated."],
  ["Bias-aware by design.", "Third-party audit (NYC AEDT-144 methodology or equivalent) is scheduled before public launch."],
];

// ── Compare-table helpers (token-driven .ap-compare; reused as-is) ───────────
function CompareCell({ value, us }: { value: string; us?: boolean }) {
  const lower = value.toLowerCase();
  if (lower === "no") return <span className="ap-compare-no">No</span>;
  if (lower === "n/a") return <span className="ap-compare-no">N/A</span>;
  if (lower === "mid") return <span className="ap-compare-mid">Partial</span>;
  if (us) {
    return (
      <span className="ap-compare-yes">
        <ApIcon name="check" className="size-[14px]" />
        {value}
      </span>
    );
  }
  return <span className="ap-compare-no">{value}</span>;
}

function CompareRow({ cap, r, t, u }: { cap: string; r: string; t: string; u: string }) {
  return (
    <div className="ap-compare-row">
      <div>{cap}</div>
      <div><CompareCell value={r} /></div>
      <div><CompareCell value={t} /></div>
      <div className="ap-compare-us"><CompareCell value={u} us /></div>
    </div>
  );
}

const GET: { tag: string; icon: ApIconName; body: string }[] = [
  { tag: "↳ Verified identity", icon: "shield-check", body: "Government-ID match + selfie liveness before the interview starts. The person on camera is the person who applied." },
  { tag: "↳ Integrity timeline", icon: "timer", body: "Every proctoring signal stamped with severity and timestamp. Low/medium are advisory. HIGH auto-ends — server-authoritative." },
  { tag: "↳ Evidence-based report", icon: "report", body: "Per-competency scores with a quoted transcript line as the evidence. Readable in 60 seconds, defensible after a year." },
  { tag: "↳ Decision audit", icon: "user", body: "A human reviewer signs every outcome. The reviewer name, the evidence shown, and the reason given are logged for every decision." },
];

const TRUST_COLS: [string, string, string][] = [
  ["Data minimization", "Detectors run on-device", "Only typed events leave the browser. Raw frames and audio never reach our servers."],
  ["Server-authoritative", "The client never decides", "Severity is assigned server-side. Auto-end is server-ordered. Clients obey the ack."],
  ["Advisory by design", "A human signs every outcome", "Aptura recommends Advance or Hold — never auto-rejects. Every decision is logged."],
];

const TRUST_BADGES: [string, string][] = [
  ["GDPR", "design-aligned"],
  ["WCAG 2.2 AA", "target"],
  ["EU AI Act", "design-aligned"],
  ["SOC 2", "on the roadmap"],
  ["Bias audit", "scheduled pre-launch"],
];

const VERTICALS: [ApIconName, string, string][] = [
  ["chip", "Technology", "Engineering, product, design"],
  ["dollar", "Financial services", "Banks, fintech, audit-heavy"],
  ["heart", "Healthcare", "Clinical, regulated"],
  ["bag", "Retail & CPG", "High-volume hiring"],
  ["academy", "Education", "Faculty & admin"],
  ["building", "Public sector", "Defensible decisions"],
  ["globe", "BPO & services", "Distributed, multilingual"],
  ["users", "Consulting", "Lateral hires"],
];

const FAQ: { q: string; a: string }[] = [
  { q: "What's actually different about Aptura's interview vs. existing AI video tools?", a: "It's a live, fullscreen-locked, identity-verified interview with on-device proctoring — not an async video upload. Every score points to a quoted transcript line. Reports include an integrity timeline with severity per event." },
  { q: "How is bias handled?", a: "Aptura's scoring model is bias-aware by design: rubric-driven scoring, evidence-linked ratings, advisory recommendations only, and a human signs every outcome. A third-party audit (NYC AEDT-144 methodology or equivalent) is scheduled before public launch." },
  { q: 'What does "human decides" mean operationally?', a: "Aptura recommends Advance or Hold — never auto-rejects. A named reviewer signs every outcome. Each decision is logged with the reviewer's name, the evidence shown, and the reason given; retention is configurable per pilot." },
  { q: "What happens to the recording, transcript, and proctoring events?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
  { q: "Can I bring our own rubric?", a: "Yes — custom rubrics are part of the pilot onboarding. The Aptura Core 6 is the default; you can adapt it to your role and we'll apply the same evidence-linked scoring approach." },
  { q: "How does it integrate with our ATS?", a: "ATS integrations (Greenhouse, Lever, Ashby, Workday, SuccessFactors) are on the roadmap. The core product runs standalone today; pilots typically start with email and CSV handoff into your existing flow. Tell us the ATS you use and we'll build that integration next." },
  { q: "What if a HIGH-severity event fires by mistake?", a: "A HIGH-severity auto-end can be appealed. The reviewer sees the clip and the reason; if the event was a false positive, the candidate is offered a fresh interview at no cost to either side." },
  { q: "Can we white-label the candidate experience?", a: "White-labelling the candidate flow (your branding, your domain) is planned for the post-launch enterprise tier. In a pilot, candidates always see the role and the company name clearly." },
];

export function CompanyBody() {
  return (
    <main id="top">
      {/* HERO — CTA-led, ApertureLens centerpiece, sample interview HUD folded in */}
      <section className="hero" aria-labelledby="hero-h1">
        <div className="wrap">
          <div className="hero-inner">
            <ApertureLens />

            <div className="float-chip glass irid-edge fc-1 float-anim" aria-hidden="true">
              <div className="n">100%</div><div className="t">applicants answered</div>
            </div>
            <div className="float-chip glass irid-edge fc-2 float-anim" aria-hidden="true">
              <div className="n">1</div><div className="t">interview per role</div>
            </div>

            <div className="hero-content">
              <span className="eyebrow"><span className="dot" aria-hidden="true" /><span>Live · proctored interview in progress</span></span>
              <h1 id="hero-h1" className="hero">Hire on proven merit. Cheat-proof by design.</h1>
              <p className="lede">Aptura runs one strictly proctored AI interview per role — and gives you an evidence-based report with an integrity timeline. Humans decide.</p>

              <div className="pills" style={{ gap: 12 }}>
                <Link href="/pilot" className="btn btn-primary btn-hero">Book a pilot</Link>
                <Link href="/login" className="btn btn-glass">Sign in</Link>
              </div>

              <div className="pills">
                <span className="pill"><ApIcon name="shield-check" className="size-4" />Fullscreen-locked, on-device proctoring</span>
                <span className="pill"><ApIcon name="check" className="size-4" />Evidence-based scoring · human decides</span>
                <span className="pill"><ApIcon name="user" className="size-4" />Every applicant answered</span>
              </div>
            </div>

            {/* Sample proctored interview HUD (was InterviewHud) */}
            <div className="hero-hud reveal">
              <div className="hud glass irid-edge" aria-label="Sample proctored interview UI">
                <div className="hud-top">
                  <span className="t">Sample interview · Senior Product Designer</span>
                  <span className="m">· demo HUD</span>
                  <span className="lock"><ApIcon name="lock" className="size-[13px]" /> Fullscreen locked</span>
                </div>
                <div className="hud-stage">
                  <span className="who"><span className="live" /> Iris · AI Interviewer</span>
                  <span className="timer mono">14:38</span>
                  <div className="self" aria-hidden="true" />
                  <div className="hud-cap"><b>Iris</b>Walk me through a tradeoff you made between speed and accessibility on your last launch. Be specific about the constraint.</div>
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
        </div>
      </section>

      {/* STATS BAND */}
      <Section>
        <Head
          eyebrow="By design"
          h2="The architecture, in numbers."
          lead="Aptura is pre-launch — these are facts about what the product does, not customer outcomes we haven't earned yet."
        />
        <div className="stats seq">
          {[
            ["1", "Proctored AI interview per role. No second takes, no off-platform retries."],
            ["40+", "On-device proctoring signals. Only typed events leave the browser."],
            ["0", "Raw frames or audio sent to our servers — ever."],
            ["100%", "Of applicants get an outcome and a reason. No ghosting."],
          ].map(([n, t]) => (
            <div className="stat glass irid-edge reveal" key={t}><div className="n">{n}</div><div className="t">{t}</div><span className="cap" /></div>
          ))}
        </div>
      </Section>

      {/* EVIDENCE FLIP */}
      <Section>
        <Head
          twoCol
          eyebrow="The shift"
          h2="Stop hiring on what the résumé says. Start hiring on what the interview proves."
          lead={
            <>
              Résumés are written. Aptura interviews are{" "}
              <em className="not-italic font-medium text-teal-strong">observed, recorded, and evidenced</em>. Same role, two different signals — and only one of them tells you whether the person can do the work, today.
            </>
          }
        />
        <div className="ev-flip seq">
          <div className="ev-col glass irid-edge reveal">
            <span className="ev-kicker">What you see today</span>
            <h3 style={{ marginTop: 8 }}>A résumé you can&apos;t verify.</h3>
            <div className="resume">
              <div className="hd">Sample candidate — Sr. Product Designer</div>
              <ResumeRow y="'24–'26" body="Lead designer · prior employer — claims unverifiable" />
              <ResumeRow y="'21–'24" body={'Sr. designer · prior employer — quotes "drove +38% lift"'} />
              <ResumeRow y="'19–'21" body="Earlier role — undated, ambiguous scope" strike />
              <ResumeRow y="Edu" body="Design degree · listed certifications · plugin author" />
              <ResumeRow y="Note" body="Cover letter style suggests AI assistance. No way to verify." muted />
            </div>
          </div>

          <div className="ev-arrow" aria-hidden="true"><ApIcon name="arrow" className="size-[18px]" /></div>

          <div className="ev-col glass irid-edge reveal">
            <span className="ev-kicker hot">What matters · Aptura Report</span>
            <h3 style={{ marginTop: 8 }}>Evidence with timestamps and a verdict.</h3>
            <div className="ev-report">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink-deep">Sample candidate</div>
                  <div className="text-[0.86rem] text-ink-3">Sr. Product Designer · sample report</div>
                </div>
                <span className="ap-pill ap-pill--good">Advance</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="ap-ring" style={{ ["--pct" as string]: 86 }}>
                  <span className="ap-ring-v">86</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">Aptura Score</span>
                  <span className="font-semibold text-ink-deep">Strong evidence</span>
                  <span className="text-[0.84rem] text-ink-2">Top 12% for this role</span>
                </div>
              </div>
              <div className="mt-5 grid gap-2.5">
                <BarRow name="Problem framing" v="4.2 / 5" pct={84} />
                <BarRow name="Communication" v="4.5 / 5" pct={90} />
                <BarRow name="Tradeoff reasoning" v="3.8 / 5" pct={76} />
                <BarRow name="Domain knowledge" v="4.1 / 5" pct={82} />
              </div>
              <div className="foot">
                <ApIcon name="shield-check" className="size-4 text-good" />
                Integrity score 98 · 0 high-severity flags · ID-verified · 1 fullscreen exit (24s)
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* HOW IT HAPPENS — 5 acts */}
      <Section id="how">
        <Head
          eyebrow="How an Aptura interview happens"
          h2="One linear, observable process — start to verified decision."
          lead="No second takes. No off-platform retries. Every step is logged, every signal is on-device, every event is severity-stamped server-side."
        />
        <div className="journey seq">
          {ACTS.map((act) => (
            <article className="j-row glass irid-edge reveal" key={act.n}>
              <div><span className="j-step">{act.step}</span><span className="j-n">{act.n}</span></div>
              <div>
                <h3>{act.title}</h3>
                <p className="j-body">{act.body}</p>
                <ul className="checks" style={{ marginTop: 14 }}>
                  {act.bullets.map((b) => <li key={b}><ApIcon name="check" className="size-[15px]" />{b}</li>)}
                </ul>
              </div>
              <div className="act-visual">{act.visual}</div>
            </article>
          ))}
        </div>
      </Section>

      {/* PLATFORM BENTO — token-driven .ap-cell reused as-is */}
      <Section id="platform">
        <Head
          twoCol
          eyebrow="One platform"
          h2="Marketplace, interview, and evidence — joined up."
          lead='Most "AI hiring" stacks pipe résumés through five disconnected vendors. Aptura is one product: the marketplace feeds the interview; the interview produces the evidence; the evidence drives the decision.'
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(160px,auto)] reveal">
          <div className="ap-cell ap-cell--anchor sm:col-span-2 lg:col-span-4 lg:row-span-2">
            <span className="ap-cell-tag">Aptura · platform</span>
            <h3 className="ap-h3" style={{ fontSize: "var(--step-2)" }}>Built around the verified interview.</h3>
            <p className="mt-2 text-[1rem] leading-relaxed text-ink-2">
              Marketplace, identity, proctoring, transcription, rubric, decision audit, and ATS sync (roadmap) — one data layer, one auditable timeline per candidate.
            </p>
            <div className="mt-5 grid items-center gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[1fr_1.2fr_1fr]">
              <div className="grid gap-2">
                <Node label="Marketplace" sub="Verified jobs & talent" />
                <Node label="Identity" sub="ID + liveness" />
              </div>
              <Node label="Verified Interview" sub="On-device proctoring · transcript · rubric · evidence" core />
              <div className="grid gap-2">
                <Node label="Integrity report" sub="Severity timeline + clips" />
                <Node label="Decision" sub="Advisory, human signs" />
              </div>
            </div>
          </div>

          <div className="ap-cell sm:col-span-1 lg:col-span-2">
            <span className="ap-cell-tag">Marketplace</span>
            <h4 className="ap-h4">Hire from a verified pool.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">Post once, distribute everywhere (pilot). Every candidate arrives ID-verified.</p>
            <div className="mt-4 grid gap-1.5 rounded-xl border border-line bg-surface-2 p-3 font-mono text-[0.78rem] text-ink-2">
              <KV k="Sample" v="view" />
              <KV k="Per role" v="one interview" />
              <KV k="Per applicant" v="one answer" />
            </div>
          </div>

          <div className="ap-cell sm:col-span-1 lg:col-span-2 lg:row-span-2">
            <span className="ap-cell-tag">Recommendations</span>
            <h4 className="ap-h4">Ranked. Explained. Auditable.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">The AI surfaces the strongest matches; the reasons are visible alongside the score.</p>
            <div className="mt-4 grid gap-2">
              <MatchCard name="Candidate A" pct="94%" tone="teal" />
              <MatchCard name="Candidate B" pct="91%" tone="coral" />
              <MatchCard name="Candidate C" pct="88%" tone="gold" />
            </div>
          </div>

          <div className="ap-cell sm:col-span-2 lg:col-span-3">
            <span className="ap-cell-tag">Workflow</span>
            <h4 className="ap-h4">Stage gates that fit your funnel.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">Standalone today, with email and CSV handoff into your existing flow. ATS integrations are on the pilot roadmap.</p>
          </div>

          <div className="ap-cell sm:col-span-2 lg:col-span-3">
            <span className="ap-cell-tag">Candidate experience</span>
            <h4 className="ap-h4">Practice first. Then the real thing.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">Candidates can sit a full practice round, see the rubric, and know exactly what&apos;s being evaluated.</p>
          </div>

          <div className="ap-cell sm:col-span-2 lg:col-span-4">
            <span className="ap-cell-tag">No ghosting</span>
            <h4 className="ap-h4">Every applicant gets an answer — and the reason behind it.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">Once your reviewer decides, the system sends an outcome + a competency-level note. Candidates can request a re-score; auditors can see the trail.</p>
          </div>

          <div className="ap-cell sm:col-span-1 lg:col-span-2">
            <span className="ap-cell-tag">Global</span>
            <h4 className="ap-h4">Built for accommodations.<br />WCAG 2.2 AA target.</h4>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">Extended time, captions, screen-reader paths — first-class, not a checkbox.</p>
          </div>
        </div>
      </Section>

      {/* INTEGRITY TIMELINE — ap-itl track reused as-is; events in Lucent glass */}
      <Section id="integrity">
        <Head
          twoCol
          eyebrow="Integrity Timeline"
          h2="Scrub the interview. See the evidence. Decide on facts."
          lead="Borrowed from your video editor — applied to your hiring decision. Click a pip, read the reason, watch the clip. Every event has a name, a severity, and a timestamp."
        />
        <div className="report glass irid-edge reveal">
          <div className="sect">
            <div className="ap-itl-head">
              <h3 className="ap-h3 text-[1.3rem]">Sample interview · Sr. Product Designer</h3>
              <span className="text-[0.86rem] text-ink-3">Sample timeline · 28m 12s · for illustration</span>
              <div className="rep-legend">
                <span><i style={{ background: "var(--good)" }} />Low</span>
                <span><i style={{ background: "var(--warn)" }} />Medium</span>
                <span><i style={{ background: "var(--danger)" }} />High · auto-end</span>
              </div>
            </div>
            <div className="ap-itl-track" style={{ marginTop: 20 }} role="img" aria-label="Interview integrity timeline">
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
              <EventCard sev="l" stamp="00:01:42 · LOW" ttl="Background voice (single)" body="One non-candidate voice detected briefly — below the second-voice threshold." clip="Reason · Single short utterance, <2s. Treated as ambient noise. No action." />
              <EventCard sev="m" flag stamp="00:09:18 · MEDIUM" ttl="Fullscreen exit (24 seconds)" body="Candidate left fullscreen for 24 seconds and returned. Surfaced to reviewer." clip="Clip · 00:09:14 → 00:09:42 · Reviewer to inspect. No auto-action." />
              <EventCard sev="l" stamp="00:23:51 · LOW" ttl="Gaze drift to corner" body="Gaze tracked off-frame for 1.8s. Within normal interview range." clip="Reason · Below threshold. No action." />
            </div>
          </div>
        </div>
      </Section>

      {/* DEFENSE SPLIT — token-driven ap-def-panel + PrivacyPanel reused as-is */}
      <Section>
        <Head
          eyebrow="Built for the era of AI copilots"
          h2="Integrity is knowing who is at the keyboard — not policing what they use."
          lead='A new generation of cheating tools advertises "runs invisibly during your interview." We treat that as a category we beat — without making candidates feel watched.'
        />
        <div className="ap-defense reveal">
          <div className="ap-def-panel ap-def-panel--detect">
            <h3 className="ap-h3 flex items-center gap-2">
              <ApIcon name="shield" className="size-6 text-[color-mix(in_oklch,var(--gold)_60%,var(--ink-deep))]" />
              What Aptura blocks
            </h3>
            <ul className="ap-def-list ap-def-list--blocks">
              {[
                ["Browser overlay copilots", "that whisper answers during screen-sharing."],
                ["Virtual cameras & deepfakes", "spoofing identity at the lens."],
                ["Secondary monitors", "or screen-sharing apps quietly relaying questions."],
                ["Synthetic voice", "generated audio or lips-out-of-sync with speech."],
                ["Multiple faces, phones in frame", "off-screen prompters."],
                ["Identity proxies", "— a different person sitting the live interview."],
              ].map(([b, rest]) => (
                <li key={b}>
                  <ApIcon name="x" />
                  <span><b>{b}</b> {rest}</span>
                </li>
              ))}
            </ul>
          </div>
          <PrivacyPanel />
        </div>
      </Section>

      {/* EVIDENCE REPORT */}
      <Section id="evidence">
        <div className="split reveal" style={{ alignItems: "start" }}>
          <div className="glass irid-edge" style={{ padding: "clamp(22px, 3vw, 30px)", borderRadius: 24 }}>
            <div className="rep-head">
              <div className="rep-avatar">SC</div>
              <div>
                <div className="rep-name">Sample candidate</div>
                <div className="rep-sub">Sr. Product Designer · sample report</div>
              </div>
              <span className="rep-badge ml">Recommended: Advance</span>
            </div>
            {REPORT_COMPS.map((c) => <Competency key={c.name} {...c} />)}
          </div>
          <div>
            <span className="label">Evidence-based scoring</span>
            <h2 className="section-head" style={{ marginTop: 12 }}>Every score points to a quoted line and a timestamp.</h2>
            <p className="section-lede" style={{ marginTop: 14 }}>
              No &quot;AI vibes.&quot; Aptura&apos;s Core 6 rubric reads the transcript, picks the candidate&apos;s own words as the evidence, and shows them next to the score — so a reviewer can disagree with the rating{" "}
              <em className="not-italic font-medium text-teal-strong">and</em> see exactly what informed it.
            </p>
            <ul className="checks" style={{ marginTop: 24, gap: 12 }}>
              {REPORT_POINTS.map(([b, rest]) => (
                <li key={b}><ApIcon name="check" className="size-[18px]" /><span><b style={{ color: "var(--ink)" }}>{b}</b> {rest}</span></li>
              ))}
            </ul>
            <Link href="/sample-report" className="btn btn-glass btn-sm" style={{ marginTop: 24 }}>
              <ApIcon name="dl" className="size-4" /> Download a sample report (PDF)
            </Link>
          </div>
        </div>
      </Section>

      {/* ADVISORY GATE */}
      <Section>
        <Head
          eyebrow="Advisory by design"
          h2="AI recommends. Humans decide."
          lead="An interview report is a recommendation, not a verdict. The hiring manager signs every advance or decline — and the audit trail keeps both sides accountable."
        />
        <div className="advisory glass irid-edge reveal">
          <div className="side">
            <div className="g-ic gold"><ApIcon name="bolt" className="size-6" /></div>
            <h3>Aptura recommends</h3>
            <p>The system produces a transparent, evidence-backed recommendation. Strong evidence is labelled &quot;Advance.&quot; Weak or thin evidence is labelled &quot;Hold&quot; — never &quot;Reject.&quot;</p>
            <ul>
              <li>Score, recommendation, and reasoning visible side-by-side</li>
              <li>Aptura Core 6 rubric drives every rating</li>
              <li>Transcript quotes anchor every claim</li>
              <li>Integrity events are surfaced, not buried</li>
            </ul>
          </div>
          <div className="side">
            <div className="g-ic coral"><ApIcon name="user" className="size-6" /></div>
            <h3>Your hiring manager decides</h3>
            <p>The recruiter or hiring manager reviews the evidence and signs the decision. Aptura never auto-rejects — and every decision is logged with the reviewer&apos;s name and reason.</p>
            <ul>
              <li>Override the recommendation in one click</li>
              <li>Reason is captured for the candidate&apos;s outcome message</li>
              <li>Every decision is logged with the reviewer&apos;s name and reason</li>
              <li>Candidate can request a re-score with new context</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* COMPARE TABLE — token-driven .ap-compare reused as-is */}
      <Section>
        <Head eyebrow="vs. the old way" h2="Resume screen, take-home, and unverified video belong in 2018." />
        <div className="ap-compare reveal">
          <div className="ap-compare-row ap-compare-head">
            <div>Capability</div>
            <div className="col">Resume<br /><span className="text-[0.84rem] font-normal text-ink-3">screen + intuition</span></div>
            <div className="col">Take-home<br /><span className="text-[0.84rem] font-normal text-ink-3">+ generic AI tools</span></div>
            <div className="col us">Aptura<br /><span className="text-[0.84rem] font-semibold text-teal">verified interview</span></div>
          </div>
          {([
            ["Identity is verified before the assessment", "no", "no", "ID match + liveness"],
            ["Cheating is detected during the assessment", "n/a", "no", "40-signal proctoring"],
            ["Every score is backed by quoted evidence", "no", "mid", "Transcript-linked"],
            ["Bias-aware by design (audit on the roadmap)", "no", "no", "By design"],
            ["Every applicant gets a real answer", "no", "mid", "Always"],
            ["Decision audit trail preserved", "no", "no", "Per decision"],
          ] as [string, string, string, string][]).map(([cap, r, t, u]) => (
            <CompareRow key={cap} cap={cap} r={r} t={t} u={u} />
          ))}
        </div>
      </Section>

      {/* WHAT YOU GET */}
      <Section id="customers">
        <Head
          twoCol
          eyebrow="What you get"
          h2="One interview. Four artifacts that travel with every candidate."
          lead="Aptura is early. Instead of customer logos we haven't earned, here is exactly what the product produces today — for every candidate, every time."
        />
        <div className="get-grid seq">
          {GET.map((a) => (
            <article className="get-card glass irid-edge reveal" key={a.tag}>
              <span className="tag">{a.tag}</span>
              <ApIcon name={a.icon} className="gi size-9" />
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* TRUST BAND */}
      <Section>
        <div className="panel glass irid-edge reveal">
          <div className="trust-cols">
            <div className="trust-intro">
              <h4>Trust isn&apos;t a badge wall — it&apos;s an architecture.</h4>
              <p>Aptura is pre-launch. We&apos;re not claiming certifications we haven&apos;t earned. Here are the choices we built into the product on day one — the ones we will be audited against.</p>
            </div>
            {TRUST_COLS.map(([eyebrow, title, body]) => (
              <div className="trust-col" key={title}>
                <span className="label">{eyebrow}</span>
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <div className="trust-badge-row">
            {TRUST_BADGES.map(([label, sub]) => (
              <span className="trust-badge" key={label}>
                <ApIcon name="shield-check" className="size-[14px]" />
                <b>{label}</b> {sub}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* DESIGNED FOR */}
      <Section>
        <Head
          twoCol
          eyebrow="Designed for"
          h2="Hiring where the answer has to be defensible."
          lead="Aptura is built for any team that needs a verifiable, evidence-based interview — across roles, geographies, and time zones. ATS integrations (Greenhouse, Lever, Ashby, Workday, SuccessFactors) are on the roadmap; the core product runs standalone today, with email and CSV handoff for early pilots."
        />
        <div className="verticals seq">
          {VERTICALS.map(([icon, title, sub]) => (
            <div className="vert reveal" key={title}>
              <ApIcon name={icon} className="size-5" />
              <b>{title}</b>
              <span>{sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* EARLY ACCESS */}
      <Section id="pricing">
        <Head
          twoCol
          eyebrow="Early access"
          h2="Aptura is in pre-launch. Talk to us about a pilot."
          lead="Pricing will land when the public launch does. Until then, we're partnering with a small number of hiring teams to run real proctored interviews against real roles — and shaping pricing around what they actually use."
        />
        <article className="pilot glass irid-edge reveal">
          <span className="ap-pill ap-pill--teal">For hiring teams</span>
          <h4>Pilot a verified interview</h4>
          <p>Run Aptura on one open role. Get a written summary of what proctoring caught (and didn&apos;t), the reports your reviewers actually used, and the integration shape we&apos;d build for you.</p>
          <Link href="/pilot" className="btn btn-primary btn-sm">Request a pilot →</Link>
        </article>
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <Head eyebrow="Questions, answered" h2="The questions hiring teams ask first." />
        <div className="faq seq">
          {FAQ.map(({ q, a }) => (
            <details className="faq-item glass irid-edge reveal" key={q}>
              <summary className="faq-q">{q}<span className="faq-mark" aria-hidden="true">+</span></summary>
              <div className="faq-a">{a}</div>
            </details>
          ))}
        </div>
      </Section>

      {/* FINAL CTA */}
      <Section id="get-started">
        <div className="panel glass irid-edge reveal final">
          <span className="label">For hiring teams</span>
          <h3>Hire on proof. Not pedigree, not polish.</h3>
          <p>Replace résumé screens, take-homes, and ghost rounds with one verified interview and one auditable decision.</p>
          <div className="row">
            <Link href="/pilot" className="btn btn-primary">Book a pilot</Link>
            <Link href="/" className="txt-link">Looking for work? See Aptura for applicants →</Link>
          </div>
        </div>
      </Section>
    </main>
  );
}
