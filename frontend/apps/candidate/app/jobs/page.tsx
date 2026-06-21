import { MarketingShell } from "@ip/ui";
import type { Metadata } from "next";

import { Marketplace } from "./marketplace";
import { query } from "./search-client";
import type { SearchJobsParams } from "./types";

export const metadata: Metadata = {
  title: "Find your next role · Aptura",
  description:
    "Browse and search published roles on Aptura — filter by work mode, employment type, and skills.",
};

/** Public, SSR, crawlable job search. The initial results are fetched server-side
 * (token-free) so job titles land in the HTML; the `Marketplace` island then takes
 * over filtering + pagination on the client, seeded by this result.
 *
 * v3 wraps the page in MarketingShell (MegaNav + MegaFooter) so the chrome matches
 * the rest of the public surface. The page is still SSR — the shell is a
 * `"use client"` component but doesn't break server-rendering of children. */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const initialParams: SearchJobsParams = {
    q: sp.q,
    location: sp.location,
    remote: sp.remote as SearchJobsParams["remote"],
    type: sp.type,
    level: sp.level,
    sort: sp.sort as SearchJobsParams["sort"],
  };
  const initial = await query(initialParams).catch(() => null);

  return (
    <MarketingShell audience="applicants">
      <section className="border-b border-line bg-surface-2 py-12 lg:py-16">
        <div className="ap-wrap">
          <span className="ap-eyebrow">Marketplace</span>
          <h1 className="ap-h2 mt-3 max-w-3xl">
            Find your next role on a verified marketplace.
          </h1>
          <p className="ap-lead mt-3">
            Every published role on Aptura runs through a proctored interview — so a strong
            application here goes further than a click on an open inbox.
          </p>
        </div>
      </section>

      <div className="ap-wrap pb-16 pt-8 lg:pt-10">
        <Marketplace initial={initial} initialParams={initialParams} />
      </div>
    </MarketingShell>
  );
}
