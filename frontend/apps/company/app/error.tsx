"use client";

import { Alert, Button } from "@ip/ui";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error:", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Alert tone="danger">An unexpected error occurred. Please try again.</Alert>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
