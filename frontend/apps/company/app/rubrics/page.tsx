"use client";

import { PageHeader } from "@ip/ui";

import { CompanyShell } from "../../components/company-shell";
import { RubricManager } from "../../components/rubric-manager";

export default function RubricsPage() {
  return (
    <CompanyShell>
      <PageHeader
        title="Rubrics"
        description="Reusable competency sets for interview scoring."
      />
      <RubricManager />
    </CompanyShell>
  );
}
