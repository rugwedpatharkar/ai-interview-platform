import { LoadingState } from "@ip/ui";

// Applicant report is the heaviest client bundle in the recruiter app
// (720+ LOC before the wave-6 split). Route-level loading gets rid of the
// blank white pause between "click a card" and "see the report shell".
export default function ApplicantReportLoading() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <LoadingState label="Loading the applicant report…" />
    </main>
  );
}
