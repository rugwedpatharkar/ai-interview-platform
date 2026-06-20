"use client";

import { EmptyState, buttonVariants } from "@ip/ui";
import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <div className="w-full">
        <EmptyState
          icon={Compass}
          title="We couldn't find that page"
          description="The link may be broken or the page may have moved. Let's get you back on track."
          action={
            <Link href="/" className={buttonVariants({ size: "sm" })}>
              Go home
            </Link>
          }
        />
      </div>
    </main>
  );
}
