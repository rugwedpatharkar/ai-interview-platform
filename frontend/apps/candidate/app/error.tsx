"use client";

import { Button, ErrorState } from "@ip/ui";
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error stopped this page from loading. Trying again often clears it.
        </p>
      </div>
      <div className="w-full">
        <ErrorState
          message="We couldn't render this page. Please try again."
          retry={reset}
        />
      </div>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
