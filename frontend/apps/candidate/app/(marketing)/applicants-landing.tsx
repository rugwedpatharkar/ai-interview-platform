"use client";

import { MarketingShell, SignInBand } from "@ip/ui";
import { useAuth } from "../../lib/auth";
import { ApplicantsHero } from "../../components/marketing/applicants-hero";
import { ApplicantJourney } from "../../components/marketing/applicant-journey";
import { NoGhostingPromise } from "../../components/marketing/no-ghosting-promise";
import { Accommodations } from "../../components/marketing/accommodations";
import { PracticeSpotlight } from "../../components/marketing/practice-spotlight";
import { ApplicantsFaq } from "../../components/marketing/applicants-faq";
import { ApplicantFinalCta } from "../../components/marketing/applicant-final-cta";
import { SampleReportCard } from "../../components/marketing/sample-report-card";
import { PrivacyPanel } from "../../components/marketing/privacy-panel";
import { StatsBand } from "../../components/marketing/hiring-teams-sections";

export function ApplicantsLanding() {
  return (
    <MarketingShell audience="applicants">
      <ApplicantsHero />
      <StatsBand />
      <ApplicantJourney />
      <NoGhostingPromise />
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 grid max-w-[62rem] gap-3">
            <span className="text-[0.92rem] font-semibold text-coral">— Privacy</span>
            <h2
              className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The strongest part of the system is everything we chose not to build.
            </h2>
          </div>
          <PrivacyPanel />
        </div>
      </section>
      <Accommodations />
      <PracticeSpotlight />
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 grid max-w-[62rem] gap-3">
            <span className="text-[0.92rem] font-semibold text-coral">— What hiring teams see about you</span>
            <h2
              className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Same report you can read. Same evidence. No hidden notes.
            </h2>
            <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
              Every hiring team sees this exact report shape. The competencies, the
              quoted transcript evidence, the integrity timeline — none of it is hidden
              from you.
            </p>
          </div>
          <SampleReportCard />
        </div>
      </section>
      <SignInBand audience="applicants" useAuthHook={useAuth} />
      <ApplicantsFaq />
      <ApplicantFinalCta />
    </MarketingShell>
  );
}
