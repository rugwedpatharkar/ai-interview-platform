import { ApertureSprite, Toaster } from "@ip/ui";
import { Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";
import { CursorGlow } from "../components/cursor-glow";

// Lucent v4 — display + body via Fontshare (Clash Display / General Sans, loaded in <head>
// below); Geist Mono for data labels via next/font. Light mode only (no dark, no appearance
// toggle) — see globals.css and PRODUCT.md (decided 2026-07-10).
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        {/* Lucent type — Clash Display (display) + General Sans (body) via Fontshare. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=general-sans@400,500,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Aperture mark + icon sprite mounted once for <svg><use href="#…" /></svg>. */}
        <ApertureSprite />
        <CursorGlow />
        <Providers>{children}</Providers>
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  );
}
