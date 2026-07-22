import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Crawl rules. Everything behind sign-in is disallowed: it carries no SEO value,
 * would render as an empty shell to a crawler, and keeps candidate/recruiter
 * surfaces out of the index. Keep in sync with the public route list in sitemap.ts.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/alerts",
          "/applications/",
          "/aptitude/",
          "/company/",
          "/interview/",
          "/login",
          "/messages",
          "/notifications",
          "/onboarding",
          "/profile",
          "/register",
          "/reset",
          "/saved",
          "/schedule",
          "/settings",
          "/verify",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
