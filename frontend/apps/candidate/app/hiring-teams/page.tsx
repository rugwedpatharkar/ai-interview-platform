import { LandingPage } from "../../components/landing/landing-page";

// The /hiring-teams deep-link into the single consolidated landing. Renders the
// same component with the hiring body active; the nav audience switch toggles to
// the candidate body in place (updating the URL via replaceState, no navigation).
export default function HiringTeamsPage() {
  return <LandingPage initialAudience="hiring" />;
}
