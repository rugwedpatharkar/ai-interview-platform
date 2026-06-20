"use client";

import { Alert, PageHeader } from "@ip/ui";
import { useRequireRole } from "@ip/shared";
import { useState } from "react";

import { CompanyShell } from "../../components/company-shell";
import { InviteMemberDialog } from "../../components/invite-member-dialog";
import { PermissionMatrix } from "../../components/permission-matrix";
import { TeamRoster } from "../../components/team-roster";
import { useAuth } from "../../lib/auth";
import { makeTeamClient } from "./team-client";

export default function TeamPage() {
  const { identity, ready } = useAuth();
  // Page-level role guard: redirect non-admins before they can interact with seat mutations
  // (defence in depth — nav-hiding is not enough; the server gates every RPC on team:manage).
  useRequireRole(identity?.role, ["company_admin"], ready);

  // One stable client for the page so the roster + invite dialog share fixture state and
  // query invalidation. Swap to createTeamClient(api) once `pnpm gen` exposes api.team.
  const [client] = useState(makeTeamClient);

  if (identity?.role !== "company_admin") {
    return (
      <CompanyShell>
        <PageHeader title="Team" />
        <Alert tone="info" title="Admins only">
          Only company admins can manage the team.
        </Alert>
      </CompanyShell>
    );
  }

  return (
    <CompanyShell>
      <PageHeader
        title="Team & permissions"
        description="Manage who can access your workspace and what they can do."
        action={<InviteMemberDialog client={client} />}
      />
      <div className="mt-6 flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Members
          </h2>
          <TeamRoster client={client} />
        </section>
        <PermissionMatrix />
      </div>
    </CompanyShell>
  );
}
