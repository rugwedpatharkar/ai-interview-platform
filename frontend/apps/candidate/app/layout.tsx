import { ApertureSprite, Toaster } from "@ip/ui";
import { Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

// Lucent v4 — display + body self-hosted (Clash Display / General Sans in app/fonts.css,
// preloaded in <head> below); Geist Mono for data labels via next/font. Light mode only
// (no dark, no appearance toggle) — see globals.css and PRODUCT.md (decided 2026-07-10).
const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Aptura — Get seen. Get interviewed. Get hired.",
  description: "Apply to roles, take the proctored interview, and always hear back.",
  applicationName: "Aptura",
};

// Light-only: a single professional light theme.
export const viewport = {
  colorScheme: "light" as const,
  themeColor: "#f7f8fb",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading a request header opts the tree into dynamic rendering, which is what
  // lets Next stamp the per-request CSP nonce (set in middleware.ts) onto its own
  // bootstrap scripts. Without it these routes prerender statically, ship HTML with
  // no nonce, and the strict `script-src` blocks every script — a blank page.
  await headers();

  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        {/* Lucent type — Clash Display (display) + General Sans (body), self-hosted in
            app/fonts.css so they load under the prod CSP `font-src 'self'` (Fontshare's
            CDN is blocked there). Preload the two above-the-fold faces to cut FOUT. */}
        <link rel="preload" href="/fonts/general-sans-400.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/clash-display-600.woff2" as="font" type="font/woff2" crossOrigin="" />
        {/* Clash 700 backs .ap-h1 above-the-fold — preload to avoid the
            weight-substitution flash on the marketing landing hero. */}
        <link rel="preload" href="/fonts/clash-display-700.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Aperture mark + icon sprite mounted once for <svg><use href="#…" /></svg>. */}
        <ApertureSprite />
        <Providers>{children}</Providers>
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  );
}
