"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import type { Rubric } from "@ip/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { useAuth } from "../lib/auth";

interface CompRow {
  id: number;
  name: string;
  weight: string; // kept as the raw input so a cleared field isn't a silent 0
}

// A weight must parse to a positive number — empty or <= 0 is a user error, not a
// silent fallback to the model default.
function weightError(row: CompRow): string | null {
  if (!row.name.trim()) return null; // unnamed rows are dropped at submit
  if (!row.weight.trim()) return "Weight is required.";
  const n = Number(row.weight);
  if (!Number.isFinite(n) || n <= 0) return "Weight must be greater than 0.";
  return null;
}

export function RubricManager() {
  const { api, token } = useAuth();
  const queryClient = useQueryClient();
  const nextId = useRef(0);
  const blankRow = (): CompRow => ({ id: nextId.current++, name: "", weight: "1" });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<CompRow[]>([blankRow()]);
  const [showErrors, setShowErrors] = useState(false);

  const rubrics = useAuthedQuery(token, {
    queryKey: ["rubrics"],
    queryFn: () => api.rubrics.listRubrics({}),
  });

  function reset() {
    setEditingId(null);
    setName("");
    setRows([blankRow()]);
    setShowErrors(false);
  }

  function loadForEdit(r: Rubric) {
    setEditingId(r.id);
    setName(r.name);
    setShowErrors(false);
    setRows(
      r.competencies.length > 0
        ? r.competencies.map((c) => ({
            id: nextId.current++,
            name: c.name,
            weight: String(c.weight),
          }))
        : [blankRow()],
    );
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["rubrics"] });

  const save = useMutation({
    mutationFn: () => {
      const competencies = rows
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim(), weight: Number(r.weight) }));
      return editingId
        ? api.rubrics.updateRubric({ id: editingId, name: name.trim(), competencies })
        : api.rubrics.createRubric({ name: name.trim(), competencies });
    },
    onSuccess: () => {
      toast.success(editingId ? "Rubric updated" : "Rubric created");
      reset();
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.rubrics.deleteRubric({ id }),
    onSuccess: () => {
      toast.success("Rubric deleted");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const namedRows = rows.filter((r) => r.name.trim());
  const nameError = !name.trim() ? "Rubric name is required." : null;
  const hasWeightError = namedRows.some((r) => weightError(r));

  function onSave() {
    setShowErrors(true);
    if (nameError || namedRows.length === 0 || hasWeightError) return;
    save.mutate();
  }

  const list = rubrics.data?.rubrics ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">
            {editingId ? "Edit rubric" : "New rubric"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Name"
            htmlFor="rubric-name"
            error={showErrors ? nameError : null}
          >
            <Input
              id="rubric-name"
              value={name}
              aria-invalid={(showErrors && Boolean(nameError)) || undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">Competencies</span>
            {rows.map((row) => {
              const wErr = showErrors ? weightError(row) : null;
              return (
                <div key={row.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2">
                    <Input
                      placeholder="Competency (e.g. Concurrency)"
                      value={row.name}
                      onChange={(e) =>
                        setRows((cur) =>
                          cur.map((r) =>
                            r.id === row.id ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      className="w-24"
                      aria-label="Weight"
                      aria-invalid={Boolean(wErr) || undefined}
                      value={row.weight}
                      onChange={(e) =>
                        setRows((cur) =>
                          cur.map((r) =>
                            r.id === row.id ? { ...r, weight: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove competency"
                      leadingIcon={Trash2}
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows((cur) => cur.filter((r) => r.id !== row.id))
                      }
                    />
                  </div>
                  {wErr && <p className="text-sm text-danger">{wErr}</p>}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              leadingIcon={Plus}
              onClick={() => setRows((cur) => [...cur, blankRow()])}
            >
              Add competency
            </Button>
          </div>

          <div className="flex gap-2">
            <Button loading={save.isPending} onClick={onSave}>
              {editingId ? "Save changes" : "Create rubric"}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Your rubrics
        </h2>
        {rubrics.isLoading && <LoadingState />}
        {rubrics.isError && (
          <ErrorState
            message={errorMessage(rubrics.error)}
            retry={() => rubrics.refetch()}
          />
        )}
        {!rubrics.isLoading && !rubrics.isError && list.length === 0 && (
          <EmptyState
            title="No rubrics yet"
            description="Create a reusable rubric to standardize interview scoring."
          />
        )}
        {list.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-display font-semibold text-foreground">{r.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {r.competencies.map((c) => c.name).join(", ") || "No competencies"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => loadForEdit(r)}>
                  Edit
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      Delete
                    </Button>
                  }
                  title="Delete this rubric?"
                  description="This can't be undone."
                  confirmLabel="Delete"
                  destructive
                  busy={remove.isPending}
                  onConfirm={() => remove.mutate(r.id)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
