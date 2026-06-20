import type { ReactNode } from "react";

// App-Router re-mounts this per navigation, so a one-shot opacity fade gives every route
// change a calm cross-fade. Opacity-only (no translate) avoids scroll-jump on tall pages;
// the global prefers-reduced-motion rule zeroes the duration to an instant cut.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
