"use client";

import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";
import {
  StatsBand,
  EvidenceFlip,
  HowItHappens,
  PlatformBento,
  IntegrityTimeline,
  DefenseSplit,
  EvidenceReport,
  AdvisoryGate,
  CompareTable,
  WhatYouGet,
  TrustBand,
  DesignedFor,
  EarlyAccess,
  HiringTeamsFaq,
} from "../../components/marketing/hiring-teams-sections";

/* ============================================================
   APTURA · LANDING (v3 · Aperture Pro)
   Implementation of docs/brand/redesign-v3/directions/D-aperture-pro.html
   16-section feature-rich, dual-audience landing.
   Pre-launch posture: every claim is truthful.
   ============================================================ */

export function MarketingLanding() {
  return (
    <MarketingShell audience="applicants">
      <Hero />
      <StatsBand />
      <EvidenceFlip />
      <HowItHappens />
      <PlatformBento />
      <IntegrityTimeline />
      <DefenseSplit />
      <EvidenceReport />
      <AdvisoryGate />
      <CompareTable />
      <WhatYouGet />
      <TrustBand />
      <DesignedFor />
      <EarlyAccess />
      <HiringTeamsFaq />
      <FinalCta />
    </MarketingShell>
  );
}

/* ============================================================
   1 — HERO (dual-audience original; Task 8 deletes this file)
   ============================================================ */
function Hero() {
  return (
    <section className="relative py-12 lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] top-[-20%] -z-10 h-[80%]"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 30%, var(--teal-glow), transparent 70%)",
        }}
      />
      <div className="ap-wrap grid items-center gap-10 lg:grid-cols-[1.08fr_1.05fr] lg:gap-12">
        <div>
          <span className="ap-status ap-status--live">
            <span className="ap-dot" /> Live · proctored interview in progress
          </span>
          <h1 className="ap-h1 mt-5">
            Hire on <span className="text-teal">proven merit.</span>
            <br />
            Cheat-proof by design.
          </h1>
          <p className="mt-5 max-w-[36ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            Aptura is a hiring marketplace where every candidate sits one strictly proctored AI
            interview — and every applicant gets a real answer. Companies get an evidence-based
            report with an integrity timeline. Humans decide.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
              Book a pilot
            </Link>
            <Link href="/sample-report" className="ap-btn ap-btn-ghost ap-btn-lg">
              <ApIcon name="dl" className="size-4" /> See a sample report
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[0.94rem] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <ApIcon name="shield-check" className="size-4 text-teal" /> Fullscreen-locked,
              on-device proctoring
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="check" className="size-4 text-teal" /> Evidence-based scoring · human
              decides
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="user" className="size-4 text-teal" /> Every applicant answered
            </span>
          </div>
        </div>
        <InterviewHud />
      </div>
    </section>
  );
}

function InterviewHud() {
  return (
    <div className="ap-hud relative" aria-label="Sample proctored interview UI">
      <div className="ap-hud-topbar">
        <span className="ap-hud-title">Sample interview · Senior Product Designer</span>
        <span className="ap-hud-meta">· demo HUD</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[0.78rem] text-ink-2">
          <ApIcon name="lock" className="size-[13px]" /> Fullscreen locked
        </span>
      </div>
      <div className="ap-hud-stage">
        <span className="ap-hud-interviewer">
          <span className="ap-dot" /> Iris · AI Interviewer
        </span>
        <span className="ap-hud-timer">14:38</span>
        <div className="ap-hud-self" aria-hidden />
        <div className="ap-hud-caption">
          <span className="ap-hud-caption-who">Iris</span>
          Walk me through a tradeoff you made between speed and accessibility on your last launch.
          Be specific about the constraint.
        </div>
      </div>
      <div className="ap-hud-strip">
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Face</span>
          <span className="ap-hud-chip-val">One</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Gaze</span>
          <span className="ap-hud-chip-val">On</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Mic</span>
          <span className="ap-hud-chip-val">Live</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Integrity</span>
          <span className="ap-hud-chip-val">98</span>
        </div>
      </div>
      <div
        className="absolute bottom-[14%] -right-3 hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[0.84rem] shadow-[0_14px_40px_-16px_color-mix(in_oklch,var(--ink-deep)_40%,transparent)] sm:flex"
        aria-hidden
      >
        <span className="size-2 rounded-full bg-gold" />
        <div>
          <b className="block text-ink-deep">Evidence captured</b>
          <span className="text-[0.76rem] text-ink-3">
            &ldquo;…I traded a 200ms perf win for WCAG AA…&rdquo;
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   16 — FINAL CTA (dual-audience original; Task 8 deletes this file)
   ============================================================ */
function FinalCta() {
  return (
    <section className="pb-12 pt-16 lg:pb-16">
      <div className="ap-wrap">
        <div
          className="grid gap-6 rounded-[28px] border border-line p-7 lg:grid-cols-2 lg:gap-8 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--teal) 12%, var(--surface)), color-mix(in oklch, var(--coral) 6%, var(--surface)))",
          }}
        >
          <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 lg:p-7">
            <span className="ap-eyebrow text-teal-strong">For companies</span>
            <h3
              className="text-[1.8rem] font-semibold tracking-[-0.022em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Hire on proof. Not pedigree, not polish.
            </h3>
            <p className="text-ink-2">
              Replace résumé screens, take-homes, and ghost rounds with one verified interview and
              one auditable decision.
            </p>
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg mt-auto self-start">
              Book a pilot
            </Link>
          </article>
          <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 lg:p-7">
            <span className="ap-eyebrow text-coral">For candidates</span>
            <h3
              className="text-[1.8rem] font-semibold tracking-[-0.022em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Get seen. Get interviewed. Get hired.
            </h3>
            <p className="text-ink-2">
              One fair, proctored interview — and a real answer every time. Practice for free; sit
              the real round when you&apos;re ready.
            </p>
            <Link href="/waitlist" className="ap-btn ap-btn-coral ap-btn-lg mt-auto self-start">
              Join the waitlist
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
