import { AppShell } from "@ip/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { Marketplace } from "./marketplace";
import { query } from "./search-client";
import type { SearchJobsParams } from "./types";

export const metadata: Metadata = {
  title: "Jobs · Aptura",
  description:
    "Browse and search published roles on Aptura — filter by work mode, employment type, and skills.",
};

/** Public, SSR, crawlable job search. The initial results are fetched server-side
 * (token-free) so job titles land in the HTML; the `Marketplace` island then takes
 * over filtering + pagination on the client, seeded by this result. */
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
    <AppShell title="Aptura" nav={<Link href="/jobs">Browse jobs</Link>}>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Find your next role
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search the live catalog of published roles.
        </p>
      </header>
      <Marketplace initial={initial} initialParams={initialParams} />
    </AppShell>
  );
}
