"use client";

import Link from "next/link";
import { ApIcon, type ApIconName } from "@ip/ui";
import { PrivacyPanel } from "./privacy-panel";

/* ============================================================
   Section primitives (file-local)
   ============================================================ */

function Section({
  children,
  id,
  divider,
}: {
  children: React.ReactNode;
  id?: string;
  divider?: boolean;
}) {
  return (
    <section
      id={id}
      className={divider ? "border-t border-line py-16 lg:py-24" : "py-16 lg:py-24"}
    >
      <div className="ap-wrap">{children}</div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  h2,
  lead,
  twoCol = false,
}: {
  eyebrow: string;
  h2: React.ReactNode;
  lead?: React.ReactNode;
  twoCol?: boolean;
}) {
  if (twoCol) {
    return (
      <div className="mb-10 grid gap-6 lg:mb-12 lg:grid-cols-[1.05fr_1fr] lg:items-end lg:gap-8">
        <div className="grid gap-2">
          <span className="ap-eyebrow">{eyebrow}</span>
          <h2 className="ap-h2">{h2}</h2>
        </div>
        {lead && <p className="ap-lead">{lead}</p>}
      </div>
    );
  }
  return (
    <div className="mb-10 grid max-w-[62rem] gap-3 lg:mb-12">
      <span className="ap-eyebrow">{eyebrow}</span>
      <h2 className="ap-h2">{h2}</h2>
      {lead && <p className="ap-lead">{lead}</p>}
    </div>
  );
}

/* ============================================================
   Internal helpers (file-local, not exported)
   ============================================================ */

function Stat({ n, unit, l }: { n: string; unit?: string; l: string }) {
  return (
    <div className="ap-stat">
      <div className="ap-stat-n">
        {n}
        {unit && <span className="ap-stat-unit">{unit}</span>}
      </div>
      <div className="ap-stat-l">{l}</div>
    </div>
  );
}

function ResumeRow({
  y,
  body,
  strike,
  muted,
}: {
  y: string;
  body: string;
  strike?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="mt-1 flex gap-2">
      <span className="w-[5ch] shrink-0 text-ink-3">{y}</span>
      <span className={muted ? "text-ink-3" : strike ? "opacity-70 line-through" : ""}>{body}</span>
    </div>
  );
}

function BarRow({ name, v, pct }: { name: string; v: string; pct: number }) {
  return (
    <div className="ap-bar">
      <span className="name">{name}</span>
      <span className="v">{v}</span>
      <span className="t">
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function Act({
  step,
  n,
  title,
  body,
  bullets,
  visual,
}: {
  step: string;
  n: string;
  title: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
}) {
  return (
    <article className="grid gap-5 rounded-3xl border border-line bg-surface p-6 lg:grid-cols-[90px_1fr_1.2fr] lg:gap-7 lg:p-7">
      <div>
        <span className="block font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
          {step}
        </span>
        <span
          className="block text-[1.6rem] font-bold tracking-[-0.02em] text-teal"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {n}
        </span>
      </div>
      <div>
        <h3 className="ap-h3 mb-2">{title}</h3>
        <p className="max-w-[42ch] text-[0.96rem] leading-relaxed text-ink-2">{body}</p>
        <ul className="mt-4 grid gap-1.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[0.9rem] text-ink-2">
              <ApIcon name="check" className="mt-[3px] size-[15px] shrink-0 text-teal" />
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-h-[160px] items-stretch rounded-2xl border border-dashed border-line-2 bg-surface-2 p-4">
        {visual}
      </div>
    </article>
  );
}

function MiniIdentity() {
  return (
    <div className="grid w-full grid-cols-[64px_1fr] items-center gap-4">
      <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[color-mix(in_oklch,var(--teal)_35%,var(--surface))] to-[color-mix(in_oklch,var(--teal)_12%,var(--surface))] text-teal">
        <ApIcon name="user" className="size-7" />
      </div>
      <div className="grid gap-1.5 text-[0.82rem] text-ink-2">
        <Row label="Government ID match" value="Verified" ok />
        <Row label="Selfie liveness" value="Pass" ok />
        <Row label="Camera · Mic" value="Live" ok />
        <Row label="Environment" value="Clear" ok />
      </div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <b className={ok ? "font-semibold text-good" : "font-semibold text-ink-deep"}>{value}</b>
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
          style={{
            background:
              "linear-gradient(135deg, oklch(0.22 0.03 220), oklch(0.12 0.02 230))",
          }}
        >
          <span className="absolute right-1.5 top-1.5 font-mono text-[0.62rem] text-white/85">
            {label}
          </span>
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
        <span className="ml-auto font-mono text-[0.7rem] tracking-[0.06em] text-ink-3">
          LOW · MED · HIGH
        </span>
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
        <span>00:00</span>
        <span>10:00</span>
        <span>20:00</span>
        <span>30:00</span>
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
        <span className="rounded-md border border-good/40 bg-good/10 px-2 py-1 text-[0.76rem] font-medium text-good">
          Advance ✓
        </span>
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[0.76rem] text-ink-2">
          Hold
        </span>
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[0.76rem] text-ink-2">
          Decline
        </span>
      </div>
    </div>
  );
}

function Node({ label, sub, core }: { label: string; sub: string; core?: boolean }) {
  if (core) {
    return (
      <div className="rounded-2xl border border-teal-strong bg-gradient-to-br from-teal to-teal-strong p-4 text-center text-teal-ink shadow-[0_12px_36px_-16px_color-mix(in_oklch,var(--teal)_60%,transparent)]">
        <b
          className="block text-[1rem] font-semibold text-teal-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {label}
        </b>
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

function MatchCard({
  name,
  pct,
  tone,
}: {
  name: string;
  pct: string;
  tone: "teal" | "coral" | "gold";
}) {
  const avBg = {
    teal: "linear-gradient(135deg, var(--teal), var(--teal-strong))",
    coral:
      "linear-gradient(135deg, var(--coral), color-mix(in oklch, var(--coral) 60%, var(--ink-deep)))",
    gold:
      "linear-gradient(135deg, var(--gold), color-mix(in oklch, var(--gold) 50%, var(--ink-deep)))",
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Event({
  sev,
  stamp,
  ttl,
  body,
  clip,
  expanded,
}: {
  sev: "l" | "m" | "h";
  stamp: string;
  ttl: string;
  body: string;
  clip: string;
  expanded?: boolean;
}) {
  const dot = {
    l: "var(--good)",
    m: "var(--warn)",
    h: "var(--danger)",
  }[sev];
  return (
    <article
      className={
        expanded
          ? "rounded-2xl border border-coral bg-surface p-4 shadow-[0_6px_24px_-10px_color-mix(in_oklch,var(--coral)_30%,transparent)]"
          : "rounded-2xl border border-line bg-surface-2 p-4"
      }
    >
      <div className="flex items-center gap-2 font-mono text-[0.78rem] text-ink-3">
        <span className="size-[7px] rounded-full" style={{ background: dot }} />
        <span>{stamp}</span>
      </div>
      <div
        className="mt-1.5 text-[1rem] font-semibold text-ink-deep"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {ttl}
      </div>
      <p className="mt-1 text-[0.86rem] text-ink-2">{body}</p>
      <div className="mt-2.5 rounded-lg border border-dashed border-[color-mix(in_oklch,var(--gold)_35%,var(--line))] bg-[color-mix(in_oklch,var(--gold)_15%,var(--surface))] px-2.5 py-2 text-[0.78rem] text-ink-2">
        {clip}
      </div>
    </article>
  );
}

function Competency({
  name,
  score,
  pct,
  quote,
  stamp,
}: {
  name: string;
  score: string;
  pct: number;
  quote: string;
  stamp: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-ink-deep">{name}</span>
        <span className="ml-auto font-mono font-semibold text-teal-strong">{score}</span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-3">
        <i className="block h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
      </div>
      <blockquote className="mt-3.5 rounded-r-lg border-l-[3px] border-teal bg-surface px-3 py-2.5 text-[0.88rem] leading-relaxed text-ink">
        <span
          className="text-[1.4em] leading-none text-teal"
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden
        >
          &ldquo;
        </span>
        {quote}
        <span
          className="text-[1.4em] leading-none text-teal"
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden
        >
          &rdquo;
        </span>
      </blockquote>
      <span className="mt-1.5 block font-mono text-[0.74rem] text-ink-3">{stamp}</span>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[9px] size-[5px] shrink-0 rounded-full bg-current opacity-50" />
      {children}
    </li>
  );
}

function CompareRow({ cap, r, t, u }: { cap: string; r: string; t: string; u: string }) {
  return (
    <div className="ap-compare-row">
      <div>{cap}</div>
      <div>
        <CompareCell value={r} />
      </div>
      <div>
        <CompareCell value={t} />
      </div>
      <div className="ap-compare-us">
        <CompareCell value={u} us />
      </div>
    </div>
  );
}

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

function TrustCol({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <span className="ap-eyebrow">{eyebrow}</span>
      <h4 className="ap-h4 mt-1.5">{title}</h4>
      <p className="mt-1.5 text-[0.9rem] leading-snug text-ink-2">{body}</p>
    </div>
  );
}

/* ============================================================
   2 — STATS BAND
   ============================================================ */
export function StatsBand() {
  return (
    <section className="pb-0 pt-0">
      <div className="ap-wrap">
        <div className="rounded-3xl border border-line bg-surface-2 px-6 py-7 lg:px-8 lg:py-9">
          <div className="mb-6 grid max-w-[62ch] gap-1">
            <span className="ap-eyebrow">By design</span>
            <h3 className="ap-h3 text-[1.25rem]">The architecture, in numbers.</h3>
            <p className="text-[0.9rem] text-ink-3">
              Aptura is pre-launch — these are facts about what the product does, not customer
              outcomes we haven&apos;t earned yet.
            </p>
          </div>
          <div className="ap-stats">
            <Stat n="1" l="Proctored AI interview per role. No second takes, no off-platform retries." />
            <Stat n="40" unit="+" l="On-device proctoring signals. Only typed events leave the browser." />
            <Stat n="0" l="Raw frames or audio sent to our servers — ever." />
            <Stat n="100" unit="%" l="Of applicants get an outcome and a reason. No ghosting." />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   3 — EVIDENCE FLIP
   ============================================================ */
export function EvidenceFlip() {
  return (
    <Section divider>
      <SectionHead
        twoCol
        eyebrow="The shift"
        h2="Stop hiring on what the résumé says. Start hiring on what the interview proves."
        lead={
          <>
            Résumés are written. Aptura interviews are{" "}
            <em className="not-italic font-medium text-teal-strong">
              observed, recorded, and evidenced
            </em>
            . Same role, two different signals — and only one of them tells you whether the person
            can do the work, today.
          </>
        }
      />
      <div className="relative grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface-2 p-6">
          <span className="text-[0.76rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
            What you see today
          </span>
          <h3 className="ap-h3 mt-2">A résumé you can&apos;t verify.</h3>
          <div className="mt-5 rounded-xl border border-dashed border-line-2 bg-surface p-4 font-mono text-[0.82rem] leading-relaxed text-ink-2">
            <div className="mb-2 font-semibold text-ink-deep">
              Sample candidate — Sr. Product Designer
            </div>
            <ResumeRow y="'24–'26" body="Lead designer · prior employer — claims unverifiable" />
            <ResumeRow y="'21–'24" body='Sr. designer · prior employer — quotes "drove +38% lift"' />
            <ResumeRow y="'19–'21" body="Earlier role — undated, ambiguous scope" strike />
            <ResumeRow y="Edu" body="Design degree · listed certifications · plugin author" />
            <ResumeRow y="Note" body="Cover letter style suggests AI assistance. No way to verify." muted />
          </div>
        </div>
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 z-10 hidden size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-coral text-coral-ink shadow-[0_6px_20px_-6px_color-mix(in_oklch,var(--coral)_50%,transparent)] lg:grid"
        >
          <ApIcon name="arrow" className="size-[18px]" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <span className="text-[0.76rem] font-semibold uppercase tracking-[0.14em] text-teal-strong">
            What matters · Aptura Report
          </span>
          <h3 className="ap-h3 mt-2">Evidence with timestamps and a verdict.</h3>
          <div className="mt-5 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-ink-deep">Sample candidate</div>
                <div className="text-[0.86rem] text-ink-3">
                  Sr. Product Designer · sample report
                </div>
              </div>
              <span className="ap-pill ap-pill--good">Advance</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="ap-ring" style={{ ["--pct" as string]: 86 }}>
                <span className="ap-ring-v">86</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
                  Aptura Score
                </span>
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
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-[0.86rem] text-ink-2">
              <ApIcon name="shield-check" className="size-4 text-good" />
              Integrity score 98 · 0 high-severity flags · ID-verified · 1 fullscreen exit (24s)
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   4 — HOW IT HAPPENS (5 acts)
   ============================================================ */
export function HowItHappens() {
  return (
    <Section divider id="how">
      <SectionHead
        eyebrow="How an Aptura interview happens"
        h2="One linear, observable process — start to verified decision."
        lead="No second takes. No off-platform retries. Every step is logged, every signal is on-device, every event is severity-stamped server-side."
      />
      <div className="grid gap-5">
        <Act
          step="Step 01"
          n="1.0"
          title="Invite & identity check"
          body="One-tap invite from the marketplace or your ATS. The candidate completes a government-ID match and an environment scan before anything starts."
          bullets={["ID match (government photo)", "Selfie liveness, anti-deepfake", "Device, mic and camera pre-flight"]}
          visual={<MiniIdentity />}
        />
        <Act
          step="Step 02"
          n="2.0"
          title="Live, strictly proctored interview"
          body="Fullscreen-locked. Camera and mic stay on throughout — there is no mute or camera-off button by design. Iris adapts questions to the role's competencies."
          bullets={["Adaptive question paths from the rubric", "Live caption + transcript", "40-signal proctoring runs on-device"]}
          visual={<MiniRoom />}
        />
        <Act
          step="Step 03"
          n="3.0"
          title="Integrity timeline"
          body="Every signal is severity-stamped server-side. Low / medium events are surfaced for human review. High-severity events auto-end the session — there is no debate later."
          bullets={["Low / Medium → advisory to your reviewer", "High severity → server-authoritative auto-end", "Every event has a clip and a reason"]}
          visual={<MiniTimeline />}
        />
        <Act
          step="Step 04"
          n="4.0"
          title="Evidence-based scoring"
          body="The Aptura Core 6 rubric scores each competency on the transcript — every score is backed by a quoted line and a timestamp. No black box."
          bullets={["Quoted transcript backs every rating", "Calibrated against a bias-audited model", "Re-score on demand — same evidence, new lens"]}
          visual={<MiniRubric />}
        />
        <Act
          step="Step 05"
          n="5.0"
          title="A human makes the call"
          body="Aptura recommends; your hiring manager decides. Every decision is logged with the reviewer's name, the evidence shown, and the reason given."
          bullets={["Advisory mode is the default", "Outcome and feedback to every candidate", "Decision audit kept per outcome (reviewer, evidence, reason)"]}
          visual={<MiniDecision />}
        />
      </div>
    </Section>
  );
}

/* ============================================================
   5 — PLATFORM BENTO
   ============================================================ */
export function PlatformBento() {
  return (
    <Section divider id="platform">
      <SectionHead
        twoCol
        eyebrow="One platform"
        h2="Marketplace, interview, and evidence — joined up."
        lead='Most "AI hiring" stacks pipe résumés through five disconnected vendors. Aptura is one product: the marketplace feeds the interview; the interview produces the evidence; the evidence drives the decision.'
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(160px,auto)]">
        <div className="ap-cell ap-cell--anchor sm:col-span-2 lg:col-span-4 lg:row-span-2">
          <span className="ap-cell-tag">Aptura · platform</span>
          <h3 className="ap-h3" style={{ fontSize: "var(--step-2)" }}>
            Built around the verified interview.
          </h3>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink-2">
            Marketplace, identity, proctoring, transcription, rubric, decision audit, and ATS sync
            (roadmap) — one data layer, one auditable timeline per candidate.
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
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            Post once, distribute everywhere (pilot). Every candidate arrives ID-verified.
          </p>
          <div className="mt-4 grid gap-1.5 rounded-xl border border-line bg-surface-2 p-3 font-mono text-[0.78rem] text-ink-2">
            <KV k="Sample" v="view" />
            <KV k="Per role" v="one interview" />
            <KV k="Per applicant" v="one answer" />
          </div>
        </div>

        <div className="ap-cell sm:col-span-1 lg:col-span-2 lg:row-span-2">
          <span className="ap-cell-tag">Recommendations</span>
          <h4 className="ap-h4">Ranked. Explained. Auditable.</h4>
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            The AI surfaces the strongest matches; the reasons are visible alongside the score.
          </p>
          <div className="mt-4 grid gap-2">
            <MatchCard name="Candidate A" pct="94%" tone="teal" />
            <MatchCard name="Candidate B" pct="91%" tone="coral" />
            <MatchCard name="Candidate C" pct="88%" tone="gold" />
          </div>
        </div>

        <div className="ap-cell sm:col-span-2 lg:col-span-3">
          <span className="ap-cell-tag">Workflow</span>
          <h4 className="ap-h4">Stage gates that fit your funnel.</h4>
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            Standalone today, with email and CSV handoff into your existing flow. ATS integrations
            are on the pilot roadmap.
          </p>
        </div>

        <div className="ap-cell sm:col-span-2 lg:col-span-3">
          <span className="ap-cell-tag">Candidate experience</span>
          <h4 className="ap-h4">Practice first. Then the real thing.</h4>
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            Candidates can sit a full practice round, see the rubric, and know exactly what&apos;s
            being evaluated.
          </p>
        </div>

        <div className="ap-cell sm:col-span-2 lg:col-span-4">
          <span className="ap-cell-tag">No ghosting</span>
          <h4 className="ap-h4">Every applicant gets an answer — and the reason behind it.</h4>
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            Once your reviewer decides, the system sends an outcome + a competency-level note.
            Candidates can request a re-score; auditors can see the trail.
          </p>
        </div>

        <div className="ap-cell sm:col-span-1 lg:col-span-2">
          <span className="ap-cell-tag">Global</span>
          <h4 className="ap-h4">
            Built for accommodations.
            <br />
            WCAG 2.2 AA target.
          </h4>
          <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-2">
            Extended time, captions, screen-reader paths — first-class, not a checkbox.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   6 — INTEGRITY TIMELINE
   ============================================================ */
export function IntegrityTimeline() {
  return (
    <Section divider id="integrity">
      <SectionHead
        twoCol
        eyebrow="Integrity Timeline"
        h2="Scrub the interview. See the evidence. Decide on facts."
        lead="Borrowed from your video editor — applied to your hiring decision. Click a pip, read the reason, watch the clip. Every event has a name, a severity, and a timestamp."
      />
      <div className="ap-itl">
        <div className="ap-itl-head">
          <h3 className="ap-h3 text-[1.3rem]">Sample interview · Sr. Product Designer</h3>
          <span className="text-[0.86rem] text-ink-3">
            Sample timeline · 28m 12s · for illustration
          </span>
          <div className="ml-auto flex gap-3 text-[0.78rem] text-ink-2">
            <LegendDot color="var(--good)" label="Low" />
            <LegendDot color="var(--warn)" label="Medium" />
            <LegendDot color="var(--danger)" label="High · auto-end" />
          </div>
        </div>
        <div className="mt-5">
          <div className="ap-itl-track" role="img" aria-label="Interview integrity timeline">
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
            <div className="ap-itl-axis">
              <span>00:00</span>
              <span>07:00</span>
              <span>14:00</span>
              <span>21:00</span>
              <span>28:12</span>
            </div>
          </div>
        </div>
        <div className="ap-itl-events">
          <Event
            sev="l"
            stamp="00:01:42 · LOW"
            ttl="Background voice (single)"
            body="One non-candidate voice detected briefly — below the second-voice threshold."
            clip="Reason · Single short utterance, <2s. Treated as ambient noise. No action."
          />
          <Event
            sev="m"
            expanded
            stamp="00:09:18 · MEDIUM"
            ttl="Fullscreen exit (24 seconds)"
            body="Candidate left fullscreen for 24 seconds and returned. Surfaced to reviewer."
            clip="Clip · 00:09:14 → 00:09:42 · Reviewer to inspect. No auto-action."
          />
          <Event
            sev="l"
            stamp="00:23:51 · LOW"
            ttl="Gaze drift to corner"
            body="Gaze tracked off-frame for 1.8s. Within normal interview range."
            clip="Reason · Below threshold. No action."
          />
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   7 — DEFENSE SPLIT
   ============================================================ */
export function DefenseSplit() {
  return (
    <Section divider>
      <SectionHead
        eyebrow="Built for the era of AI copilots"
        h2="Integrity is knowing who is at the keyboard — not policing what they use."
        lead='A new generation of cheating tools advertises "runs invisibly during your interview." We treat that as a category we beat — without making candidates feel watched.'
      />
      <div className="ap-defense">
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
              <li key={b as string}>
                <ApIcon name="x" />
                <span>
                  <b>{b}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <PrivacyPanel />
      </div>
    </Section>
  );
}

/* ============================================================
   8 — EVIDENCE REPORT
   ============================================================ */
export function EvidenceReport() {
  return (
    <Section divider id="evidence">
      <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-coral to-[color-mix(in_oklch,var(--coral)_60%,var(--ink-deep))] font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              SC
            </div>
            <div>
              <div
                className="font-semibold text-ink-deep text-[1.06rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Sample candidate
              </div>
              <div className="text-[0.84rem] text-ink-3">Sr. Product Designer · sample report</div>
            </div>
            <span className="ml-auto rounded-full border border-good/40 bg-good/10 px-3 py-1 text-[0.78rem] font-semibold text-good">
              Recommended: Advance
            </span>
          </div>
          <Competency
            name="Tradeoff reasoning"
            score="3.8 / 5"
            pct={76}
            quote="I'd trade a 200ms performance win for WCAG AA every time on a public-facing flow — the accessibility regression is a permanent cost; the perf win we can claw back at the edge."
            stamp="Transcript · 00:14:38 — verbatim, time-stamped, untouched."
          />
          <Competency
            name="Problem framing"
            score="4.2 / 5"
            pct={84}
            quote='The brief said "make checkout faster," but the actual constraint was returning users on flaky connections — so we reframed the problem as perceived speed and optimistic UI, not raw latency.'
            stamp="Transcript · 00:08:11 — verbatim, time-stamped, untouched."
          />
          <Competency
            name="Communication"
            score="4.5 / 5"
            pct={90}
            quote="Let me restate that so I'm sure — you're asking how I'd defend the decision to engineering after we'd already shipped, not before."
            stamp="Transcript · 00:21:02 — verbatim, time-stamped, untouched."
          />
        </div>
        <div>
          <span className="ap-eyebrow">Evidence-based scoring</span>
          <h3 className="ap-h3 mt-2 text-[1.8rem]">
            Every score points to a quoted line and a timestamp.
          </h3>
          <p className="ap-lead mt-3">
            No &quot;AI vibes.&quot; Aptura&apos;s Core 6 rubric reads the transcript, picks the
            candidate&apos;s own words as the evidence, and shows them next to the score — so a
            reviewer can disagree with the rating{" "}
            <em className="not-italic font-medium text-teal-strong">and</em> see exactly what
            informed it.
          </p>
          <ul className="mt-6 grid gap-3">
            {[
              ["The Aptura Core 6", "— Problem framing · Communication · Domain knowledge · Tradeoff reasoning · Decision quality · Integrity. Published and versioned."],
              ["Quoted evidence per score.", "Disagree with the rating? The proof is right there."],
              ["Re-score on demand.", "New role, new lens — same evidence, recalculated."],
              ["Bias-aware by design.", "Third-party audit (NYC AEDT-144 methodology or equivalent) is scheduled before public launch."],
            ].map(([b, rest]) => (
              <li key={b as string} className="flex items-start gap-2.5 text-[0.96rem] text-ink-2">
                <ApIcon name="check" className="mt-[3px] size-[18px] shrink-0 text-teal" />
                <span>
                  <b className="text-ink-deep">{b}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/sample-report"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[0.9rem] font-semibold text-ink-deep transition-colors hover:bg-surface-2"
          >
            <ApIcon name="dl" className="size-4" /> Download a sample report (PDF)
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   9 — ADVISORY GATE
   ============================================================ */
export function AdvisoryGate() {
  return (
    <Section divider>
      <SectionHead
        eyebrow="Advisory by design"
        h2="AI recommends. Humans decide."
        lead="An interview report is a recommendation, not a verdict. The hiring manager signs every advance or decline — and the audit trail keeps both sides accountable."
      />
      <div className="grid overflow-hidden rounded-3xl border border-line lg:grid-cols-2">
        <div className="bg-gradient-to-br from-[color-mix(in_oklch,var(--gold)_8%,var(--surface))] to-surface p-7 lg:border-r lg:border-line">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gold-soft text-[color-mix(in_oklch,var(--gold)_50%,var(--ink-deep))]">
            <ApIcon name="bolt" className="size-6" />
          </div>
          <h3 className="ap-h3 text-[1.45rem]">Aptura recommends</h3>
          <p className="mt-2 text-ink-2">
            The system produces a transparent, evidence-backed recommendation. Strong evidence is
            labelled &quot;Advance.&quot; Weak or thin evidence is labelled &quot;Hold&quot; —
            never &quot;Reject.&quot;
          </p>
          <ul className="mt-4 grid gap-2 text-[0.92rem] text-ink-2">
            <Bullet>Score, recommendation, and reasoning visible side-by-side</Bullet>
            <Bullet>Aptura Core 6 rubric drives every rating</Bullet>
            <Bullet>Transcript quotes anchor every claim</Bullet>
            <Bullet>Integrity events are surfaced, not buried</Bullet>
          </ul>
        </div>
        <div className="bg-gradient-to-br from-[color-mix(in_oklch,var(--coral)_5%,var(--surface))] to-surface p-7">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral">
            <ApIcon name="user" className="size-6" />
          </div>
          <h3 className="ap-h3 text-[1.45rem]">Your hiring manager decides</h3>
          <p className="mt-2 text-ink-2">
            The recruiter or hiring manager reviews the evidence and signs the decision. Aptura
            never auto-rejects — and every decision is logged with the reviewer&apos;s name and
            reason.
          </p>
          <ul className="mt-4 grid gap-2 text-[0.92rem] text-ink-2">
            <Bullet>Override the recommendation in one click</Bullet>
            <Bullet>Reason is captured for the candidate&apos;s outcome message</Bullet>
            <Bullet>Every decision is logged with the reviewer&apos;s name and reason</Bullet>
            <Bullet>Candidate can request a re-score with new context</Bullet>
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   10 — COMPARE TABLE
   ============================================================ */
export function CompareTable() {
  return (
    <Section divider>
      <SectionHead
        eyebrow="vs. the old way"
        h2="Resume screen, take-home, and unverified video belong in 2018."
      />
      <div className="ap-compare">
        <div className="ap-compare-row ap-compare-head">
          <div>Capability</div>
          <div className="col">
            Resume
            <br />
            <span className="text-[0.84rem] font-normal text-ink-3">screen + intuition</span>
          </div>
          <div className="col">
            Take-home
            <br />
            <span className="text-[0.84rem] font-normal text-ink-3">+ generic AI tools</span>
          </div>
          <div className="col us">
            Aptura
            <br />
            <span className="text-[0.84rem] font-semibold text-teal">verified interview</span>
          </div>
        </div>
        {[
          ["Identity is verified before the assessment", "no", "no", "ID match + liveness"],
          ["Cheating is detected during the assessment", "n/a", "no", "40-signal proctoring"],
          ["Every score is backed by quoted evidence", "no", "mid", "Transcript-linked"],
          ["Bias-aware by design (audit on the roadmap)", "no", "no", "By design"],
          ["Every applicant gets a real answer", "no", "mid", "Always"],
          ["Decision audit trail preserved", "no", "no", "Per decision"],
        ].map(([cap, r, t, u]) => (
          <CompareRow key={cap as string} cap={cap as string} r={r as string} t={t as string} u={u as string} />
        ))}
      </div>
    </Section>
  );
}

/* ============================================================
   11 — WHAT YOU GET
   ============================================================ */
export function WhatYouGet() {
  const artifacts: { tag: string; icon: ApIconName; body: string }[] = [
    {
      tag: "↳ Verified identity",
      icon: "shield-check",
      body: "Government-ID match + selfie liveness before the interview starts. The person on camera is the person who applied.",
    },
    {
      tag: "↳ Integrity timeline",
      icon: "timer",
      body: "Every proctoring signal stamped with severity and timestamp. Low/medium are advisory. HIGH auto-ends — server-authoritative.",
    },
    {
      tag: "↳ Evidence-based report",
      icon: "report",
      body: "Per-competency scores with a quoted transcript line as the evidence. Readable in 60 seconds, defensible after a year.",
    },
    {
      tag: "↳ Decision audit",
      icon: "user",
      body: "A human reviewer signs every outcome. The reviewer name, the evidence shown, and the reason given are logged for every decision.",
    },
  ];
  return (
    <Section divider id="customers">
      <SectionHead
        twoCol
        eyebrow="What you get"
        h2="One interview. Four artifacts that travel with every candidate."
        lead="Aptura is early. Instead of customer logos we haven't earned, here is exactly what the product produces today — for every candidate, every time."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {artifacts.map((a) => (
          <article
            key={a.tag}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
          >
            <span
              className="text-[1rem] font-bold tracking-[-0.02em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {a.tag}
            </span>
            <div className="flex items-center">
              <ApIcon name={a.icon} className="size-9 text-teal" />
            </div>
            <p className="flex-1 text-[0.9rem] leading-snug text-ink-2">{a.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ============================================================
   12 — TRUST BAND
   ============================================================ */
export function TrustBand() {
  return (
    <Section divider>
      <div className="ap-trust">
        <div className="ap-trust-grid">
          <div>
            <h4 className="ap-h4">Trust isn&apos;t a badge wall — it&apos;s an architecture.</h4>
            <p className="mt-2 text-[0.9rem] leading-snug text-ink-2">
              Aptura is pre-launch. We&apos;re not claiming certifications we haven&apos;t earned.
              Here are the choices we built into the product on day one — the ones we will be
              audited against.
            </p>
          </div>
          <TrustCol eyebrow="Data minimization" title="Detectors run on-device" body="Only typed events leave the browser. Raw frames and audio never reach our servers." />
          <TrustCol eyebrow="Server-authoritative" title="The client never decides" body="Severity is assigned server-side. Auto-end is server-ordered. Clients obey the ack." />
          <TrustCol eyebrow="Advisory by design" title="A human signs every outcome" body="Aptura recommends Advance or Hold — never auto-rejects. Every decision is logged." />
        </div>
        <div className="ap-trust-badges">
          {[
            ["GDPR", "design-aligned"],
            ["WCAG 2.2 AA", "target"],
            ["EU AI Act", "design-aligned"],
            ["SOC 2", "on the roadmap"],
            ["Bias audit", "scheduled pre-launch"],
          ].map(([label, sub]) => (
            <span key={label} className="ap-badge">
              <ApIcon name="shield-check" />
              <b>{label}</b>
              <span>{sub}</span>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   13 — DESIGNED FOR
   ============================================================ */
export function DesignedFor() {
  const verticals = [
    ["chip", "Technology", "Engineering, product, design"],
    ["dollar", "Financial services", "Banks, fintech, audit-heavy"],
    ["heart", "Healthcare", "Clinical, regulated"],
    ["bag", "Retail & CPG", "High-volume hiring"],
    ["academy", "Education", "Faculty & admin"],
    ["building", "Public sector", "Defensible decisions"],
    ["globe", "BPO & services", "Distributed, multilingual"],
    ["users", "Consulting", "Lateral hires"],
  ] as const;
  return (
    <Section divider>
      <SectionHead
        twoCol
        eyebrow="Designed for"
        h2="Hiring where the answer has to be defensible."
        lead="Aptura is built for any team that needs a verifiable, evidence-based interview — across roles, geographies, and time zones. ATS integrations (Greenhouse, Lever, Ashby, Workday, SuccessFactors) are on the roadmap; the core product runs standalone today, with email and CSV handoff for early pilots."
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8">
        {verticals.map(([icon, title, sub]) => (
          <div
            key={title}
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-4 text-center text-[0.82rem] text-ink-2"
          >
            <ApIcon name={icon} className="size-5 text-teal" />
            <b className="font-semibold text-ink-deep">{title}</b>
            <span>{sub}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ============================================================
   14 — EARLY ACCESS
   ============================================================ */
export function EarlyAccess() {
  return (
    <Section divider id="pricing">
      <SectionHead
        twoCol
        eyebrow="Early access"
        h2="Aptura is in pre-launch. Talk to us about a pilot."
        lead="Pricing will land when the public launch does. Until then, we're partnering with a small number of hiring teams to run real proctored interviews against real roles — and shaping pricing around what they actually use."
      />
      <div className="mx-auto max-w-xl">
        <article
          className="flex flex-col gap-3 rounded-2xl border p-6"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--teal) 6%, var(--surface)), var(--surface))",
            borderColor: "color-mix(in oklch, var(--teal) 22%, var(--line))",
          }}
        >
          <span className="ap-pill ap-pill--teal self-start">For hiring teams</span>
          <h4
            className="text-[1.4rem] font-semibold tracking-[-0.02em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pilot a verified interview
          </h4>
          <p className="text-[0.92rem] leading-snug text-ink-2">
            Run Aptura on one open role. Get a written summary of what proctoring caught (and
            didn&apos;t), the reports your reviewers actually used, and the integration shape
            we&apos;d build for you.
          </p>
          <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-sm self-start">
            Request a pilot →
          </Link>
        </article>
      </div>
    </Section>
  );
}

/* ============================================================
   15 — HIRING TEAMS FAQ (recruiter-POV, 8 items)
   ============================================================ */
export function HiringTeamsFaq() {
  const items = [
    { q: "What's actually different about Aptura's interview vs. existing AI video tools?", a: "It's a live, fullscreen-locked, identity-verified interview with on-device proctoring — not an async video upload. Every score points to a quoted transcript line. Reports include an integrity timeline with severity per event." },
    { q: "How is bias handled?", a: "Aptura's scoring model is bias-aware by design: rubric-driven scoring, evidence-linked ratings, advisory recommendations only, and a human signs every outcome. A third-party audit (NYC AEDT-144 methodology or equivalent) is scheduled before public launch." },
    { q: 'What does "human decides" mean operationally?', a: "Aptura recommends Advance or Hold — never auto-rejects. A named reviewer signs every outcome. Each decision is logged with the reviewer's name, the evidence shown, and the reason given; retention is configurable per pilot." },
    { q: "What happens to the recording, transcript, and proctoring events?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
    { q: "Can I bring our own rubric?", a: "Yes — custom rubrics are part of the pilot onboarding. The Aptura Core 6 is the default; you can adapt it to your role and we'll apply the same evidence-linked scoring approach." },
    { q: "How does it integrate with our ATS?", a: "ATS integrations (Greenhouse, Lever, Ashby, Workday, SuccessFactors) are on the roadmap. The core product runs standalone today; pilots typically start with email and CSV handoff into your existing flow. Tell us the ATS you use and we'll build that integration next." },
    { q: "What if a HIGH-severity event fires by mistake?", a: "A HIGH-severity auto-end can be appealed. The reviewer sees the clip and the reason; if the event was a false positive, the candidate is offered a fresh interview at no cost to either side." },
    { q: "Can we white-label the candidate experience?", a: "White-labelling the candidate flow (your branding, your domain) is planned for the post-launch enterprise tier. In a pilot, candidates always see the role and the company name clearly." },
  ];

  return (
    <Section divider id="faq">
      <SectionHead
        eyebrow="Questions, answered"
        h2="The questions hiring teams ask first."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map(({ q, a }) => (
          <details key={q} className="group rounded-xl border border-line bg-surface p-4">
            <summary
              className="flex cursor-pointer list-none items-center gap-3 font-semibold text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {q}
              <span className="ml-auto text-xl text-ink-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
