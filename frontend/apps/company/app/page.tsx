import { RecruiterDashboard } from "./dashboard";

// `/` is the recruiter's at-a-glance dashboard (was a redirect to /jobs). The server
// shell delegates to the "use client" body; CompanyShell still enforces the auth + role
// gate, so dropping the redirect doesn't remove the gate.
export default function Home() {
  return <RecruiterDashboard />;
}
