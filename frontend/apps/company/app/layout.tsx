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
  title: "Recruiter · Interview Platform",
  description: "Post jobs, review applicants, and decide.",
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
