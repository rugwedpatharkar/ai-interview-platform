"use client";

import { Badge, Button, Card, CardContent, ConfirmDialog } from "@ip/ui";
import { Trash2 } from "lucide-react";

import type { JobAlertDTO } from "../app/alerts/types";
import { summarizeAlert } from "../lib/job-alerts-client";

export function AlertRow({
  alert,
  onDelete,
  deleting,
}: {
  alert: JobAlertDTO;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {summarizeAlert(alert)}
          </span>
          <span className="text-xs text-muted-foreground">
            {alert.frequency === "daily" ? "Daily" : "Weekly"} ·{" "}
            {alert.lastRunAt
              ? `last run ${new Date(alert.lastRunAt).toLocaleDateString()}`
              : "Never run yet"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral" variant="subtle">
            {alert.frequency}
          </Badge>
          <ConfirmDialog
            title="Delete this alert?"
            description="You'll stop receiving notifications for this saved search."
            confirmLabel="Delete"
            destructive
            onConfirm={() => onDelete(alert.alertId)}
            trigger={
              <Button variant="ghost" size="sm" aria-label="Delete alert" loading={deleting}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
