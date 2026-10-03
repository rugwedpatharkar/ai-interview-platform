import { LoadingState } from "@ip/ui";

export default function MessagesLoading() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <LoadingState label="Loading your messages…" />
    </main>
  );
}
