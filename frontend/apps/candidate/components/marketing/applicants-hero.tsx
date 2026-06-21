"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function ApplicantsHero() {
  return (
    <section className="relative py-12 lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] top-[-20%] -z-10 h-[80%]"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 30%, color-mix(in oklch, var(--coral) 35%, transparent), transparent 70%)",
        }}
      />
      <div className="ap-wrap grid items-center gap-10 lg:grid-cols-[1.08fr_1.05fr] lg:gap-12">
        <div>
          <span className="ap-status ap-status--live">
            <span className="ap-dot" /> The interview you&apos;ll sit
          </span>
          <h1 className="ap-h1 mt-5">
            Get seen. Get interviewed.
            <br />
            <span className="text-coral">Get hired.</span>
          </h1>
          <p className="mt-5 max-w-[40ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            One fair, proctored AI interview. Always hear back — with a real answer and
            a reason. Aptura is hiring decided on merit.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/jobs" className="ap-btn ap-btn-coral ap-btn-lg">
              Find roles
            </Link>
            <Link href="#sign-in" className="ap-btn ap-btn-ghost ap-btn-lg">
              Sign in
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[0.94rem] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <ApIcon name="shield-check" className="size-4 text-coral" />
              No real-time human watcher
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="check" className="size-4 text-coral" />
              Every applicant gets a real answer
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="user" className="size-4 text-coral" />
              Free practice round, no scoring
            </span>
          </div>
        </div>
        <ApplicantsHudPreview />
      </div>
    </section>
  );
}

function ApplicantsHudPreview() {
  // Reuses the InterviewHud structure but tagged "the interview YOU will sit"
  // rather than the recruiter's view. Identical chip strip; identical caption.
  return (
    <div className="ap-hud relative" aria-label="Sample proctored interview UI (your view)">
      <div className="ap-hud-topbar">
        <span className="ap-hud-title">Sample interview · Your view</span>
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
          Walk me through a tradeoff you made between speed and accessibility on
          your last project. Take your time.
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
    </div>
  );
}
