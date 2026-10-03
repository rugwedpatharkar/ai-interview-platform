import { LoadingState } from "@ip/ui";

// Route-level loading UI — shown while the aptitude route's client bundle
// downloads AND while its initial data is in-flight. Same visual as the in-
// page loading fallback the client used to render, promoted so Next can
// stream the shell earlier.
export default function AptitudeLoading() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <LoadingState label="Loading your test…" />
    </main>
  );
}
