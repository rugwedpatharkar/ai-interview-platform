"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Token-styled banner shown when the browser goes offline. Tracks navigator.onLine
 * via the online/offline events. Renders nothing when online (and during SSR, where
 * we optimistically assume connectivity until the first event). No animation, so it's
 * reduced-motion-safe by construction. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warning-border bg-warning-surface px-4 py-1.5 text-xs font-medium text-warning-foreground"
    >
      <WifiOff className="size-3.5" aria-hidden />
      You&apos;re offline — changes may not save until you reconnect.
    </div>
  );
}
