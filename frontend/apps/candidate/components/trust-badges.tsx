import { Badge } from "@ip/ui";

import { trustChips } from "../app/companies/[id]/company-client";
import type { TrustSignals } from "../app/companies/[id]/types";

/** Funnel-derived trust signals. The first chip ("Actively reviewing") gets the
 * success tone to anchor the anti-ghosting promise; the rest are neutral. */
export function TrustBadges({ trust }: { trust: TrustSignals }) {
  const chips = trustChips(trust);
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <Badge
          key={c}
          tone={i === 0 && trust.activelyReviewing ? "success" : "neutral"}
          variant="subtle"
        >
          {c}
        </Badge>
      ))}
    </div>
  );
}
