import { LoadingState } from "@ip/ui";

export default function OnboardingLoading() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <LoadingState label="Preparing your onboarding…" />
    </main>
  );
}
