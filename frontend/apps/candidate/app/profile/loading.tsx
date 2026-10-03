import { LoadingState } from "@ip/ui";

export default function ProfileLoading() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <LoadingState label="Loading your profile…" />
    </main>
  );
}
