"use client";

import { LoadingState } from "@ip/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The consent + erasure controls moved into /settings (Privacy tab). This route stays as a
// thin redirect so existing links/bookmarks still land on the right place.
export default function AccountPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=privacy");
  }, [router]);
  return <LoadingState label="Redirecting…" />;
}
