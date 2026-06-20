import { ThemeProvider, Toaster, themeScript } from "@ip/ui";
import { Geist, Fraunces } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// Editorial serif display (Midnight v3). Optical-size variable; 400 + 600 cover body-display + headings.
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
  variable: "--font-display",
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
  ),
  title: "Aptura for companies — Hire on proven merit.",
  description: "Post jobs, review proctored interview reports, and decide on evidence.",
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
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* Set the persisted theme class on <html> before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <Providers>{children}</Providers>
          <Toaster richColors closeButton position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
