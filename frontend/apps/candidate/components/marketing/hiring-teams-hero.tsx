"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function HiringTeamsHero() {
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
            Aptura runs one strictly proctored AI interview per role — and gives you
            an evidence-based report with an integrity timeline. Humans decide.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
              Book a pilot
            </Link>
            <Link href="#sign-in" className="ap-btn ap-btn-ghost ap-btn-lg">
              Sign in
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[0.94rem] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <ApIcon name="shield-check" className="size-4 text-teal" />
              Fullscreen-locked, on-device proctoring
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="check" className="size-4 text-teal" />
              Evidence-based scoring · human decides
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="user" className="size-4 text-teal" />
              Every applicant answered
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
