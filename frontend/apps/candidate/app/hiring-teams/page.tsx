"use client";

import { MarketingShell, SignInBand } from "@ip/ui";
import { useAuth } from "../../lib/auth";
import { HiringTeamsHero } from "../../components/marketing/hiring-teams-hero";
import { HiringTeamsFinalCta } from "../../components/marketing/hiring-teams-final-cta";
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

export default function HiringTeamsPage() {
  return (
    <MarketingShell audience="hiring-teams">
      <HiringTeamsHero />
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
      <SignInBand audience="hiring-teams" useAuthHook={useAuth} />
      <HiringTeamsFaq />
      <HiringTeamsFinalCta />
    </MarketingShell>
  );
}
