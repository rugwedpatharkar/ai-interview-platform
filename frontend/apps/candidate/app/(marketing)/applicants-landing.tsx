"use client";

import { LandingPage } from "../../components/landing/landing-page";

// The candidate entry into the single consolidated landing. Kept as a named
// `ApplicantsLanding` export because app/page-client.tsx renders it for signed-out
// visitors; the nav audience switch toggles to the hiring body in place.
export function ApplicantsLanding() {
  return <LandingPage initialAudience="candidates" />;
}
