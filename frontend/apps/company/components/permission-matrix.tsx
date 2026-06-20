"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ip/ui";
import { Check } from "lucide-react";

import { ROLE_LABELS, SCOPES, can, type CompanyRole } from "../app/team/types";

const ROLES: CompanyRole[] = ["company_admin", "recruiter", "hiring_manager"];

// Read-only role×scope grid. Answers "what can a hiring manager do?" at a glance and stays
// in lock-step with the server matrix (lib/lib/schemas/permissions.py — the authority).
export function PermissionMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What each role can do</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">
                    {ROLE_LABELS[r]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCOPES.map((s) => (
                <TableRow key={s.scope}>
                  <TableCell className="text-foreground">{s.label}</TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      {can(r, s.scope) ? (
                        <Check className="mx-auto size-4 text-success" aria-label="allowed" />
                      ) : (
                        <span className="text-muted-foreground" aria-label="not allowed">
                          —
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
