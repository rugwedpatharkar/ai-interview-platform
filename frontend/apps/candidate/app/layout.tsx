import { ApertureSprite, ThemeProvider, Toaster } from "@ip/ui";
import { Hanken_Grotesk, Schibsted_Grotesk, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { appearanceScript } from "./settings/appearance-client";
import { Providers } from "./providers";

// Aperture Pro · v3 — humanist body, geometric display, mono for data labels.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const display = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
});

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

// Next 15: theme-color + colorScheme live in the viewport export, not metadata.
export const viewport = {
  colorScheme: "light dark" as const,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#15161e" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint script — reads aptura.appearance.v1 from localStorage and applies mode +
            base + accent (incl. custom hue) onto <html> BEFORE React hydrates. No FOUC. */}
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Aperture mark + lucide-style icons mounted once for use via <svg><use href="#…" /></svg> */}
        <ApertureSprite />
        <ThemeProvider>
          <Providers>{children}</Providers>
          <Toaster richColors closeButton position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
