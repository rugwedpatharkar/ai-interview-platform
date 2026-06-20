import { AuthSplitPanel } from "@ip/ui";
import type { ReactNode } from "react";

/**
 * Split auth layout: the form pane (children) on the left, the brand panel on
 * the right. Below `lg` the panel is hidden and the form pane fills the screen
 * (matching the previous single-column auth). The left pane keeps the form's
 * `max-w-md` centering so the wrapped form bodies are untouched.
 *
 * `selfFramed` is for children that already render their own full-height
 * centered `<main>` (e.g. `@ip/ui`'s `VerifyCard`): the child is dropped
 * straight into the left grid cell so we don't nest a second `<main>` or stack
 * two `min-h-screen` frames.
 */
export function AuthLayout({
  children,
  selfFramed = false,
}: {
  children: ReactNode;
  selfFramed?: boolean;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {selfFramed ? (
        children
      ) : (
        <main className="flex flex-col justify-center px-6 py-10">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </main>
      )}
      <AuthSplitPanel />
    </div>
  );
}
