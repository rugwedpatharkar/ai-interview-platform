import type { MetadataRoute } from "next";

import { query } from "./jobs/search-client";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Public, crawlable routes only — anything behind sign-in is excluded here and in
// robots.ts. Ordered roughly by importance; priorities below follow the same shape.
const STATIC_PATHS = [
  "",
  "/jobs",
  "/pilot",
  "/waitlist",
  "/sample-report",
  "/trust",
  "/accessibility",
  "/ai-explainability",
  "/what-we-dont-do",
  "/privacy",
  "/terms",
  "/dpa",
  "/status",
] as const;

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (path === "/jobs") return 0.9;
  return 0.4;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === "" || path === "/jobs" ? "daily" : "monthly",
    priority: priorityFor(path),
  }));

  // Published jobs are the pages that actually earn search traffic. The public
  // endpoint is token-free, but it is still a network call: a sitemap that throws
  // returns a 500 and Google drops every URL in it, so degrade to the static routes
  // rather than failing the whole document.
  let jobEntries: MetadataRoute.Sitemap = [];
  try {
    const { jobs } = await query({ pageSize: 200, sort: "recent" });
    jobEntries = jobs.map((job) => ({
      url: `${BASE}/jobs/${encodeURIComponent(job.jobId)}`,
      lastModified: new Date(job.postedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch {
    jobEntries = [];
  }

  return [...staticEntries, ...jobEntries];
}
