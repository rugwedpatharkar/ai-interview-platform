import { LoadingState } from "@ip/ui";

// Interview route ships the LiveKit + proctor detectors; a route-level
// loading UI at least shows a friendly wait instead of a white pause.
export default function InterviewLoading() {
  return (
    <main className="mx-auto grid min-h-screen place-items-center p-6">
      <LoadingState label="Preparing your interview…" />
    </main>
  );
}
