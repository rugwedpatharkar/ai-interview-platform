"use client";

import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Spinner,
  Textarea,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import type { Rubric } from "@ip/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";

interface CompRow {
  id: number;
  name: string;
  weight: string; // raw input so a cleared field isn't a silent 0
  descriptor: string; // local-state only — server doesn't persist descriptors today
}

// A weight must parse to a positive number — empty or <= 0 is a user error, not a silent
// fallback to the model default.
function weightError(row: CompRow): string | null {
  if (!row.name.trim()) return null; // unnamed rows are dropped at submit
  if (!row.weight.trim()) return "Weight is required.";
  const n = Number(row.weight);
  if (!Number.isFinite(n) || n <= 0) return "Weight must be greater than 0.";
  return null;
}

// Rubrics editor — list rail (left) + editor anchor (right). Preserves api.rubrics.*.
// Note: descriptor field is LOCAL-STATE ONLY today; the server schema is name+weight only.
// Hooked up here so the FE is ready the moment the proto adds it; until then, descriptors
// vanish on page leave (truthful UI — placeholder shows the caveat).
export default function RubricsPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  const queryClient = useQueryClient();
  const nextId = useRef(0);
  const blankRow = (): CompRow => ({
    id: nextId.current++,
    name: "",
    weight: "1",
    descriptor: "",
  });

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
            descriptor: "",
          }))
        : [blankRow()],
    );
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rubrics"] });

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
      if (editingId) reset();
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
  const weightTotal = namedRows.reduce((s, r) => s + (Number(r.weight) || 0), 0);

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3">
        <p className="ap-eyebrow">Rubrics</p>
        <h1 className="ap-h2">The scoring contract.</h1>
        <p className="ap-lead text-base">
          Define the competencies your interviews assess. Each rubric becomes a per-role
          scoring template — same questions, same weights, every candidate.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* List rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="ap-cell">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="ap-h4">Your rubrics</h2>
              <button
                type="button"
                className="ap-btn ap-btn-ghost ap-btn-sm"
                onClick={reset}
                title="Start fresh"
              >
                <Plus className="size-4" aria-hidden /> New
              </button>
            </div>

            {rubrics.isLoading && (
              <div className="mt-4">
                <LoadingState />
              </div>
            )}
            {rubrics.isError && (
              <div className="mt-4">
                <ErrorState
                  message={errorMessage(rubrics.error)}
                  retry={() => rubrics.refetch()}
                />
              </div>
            )}
            {!rubrics.isLoading && !rubrics.isError && list.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={ClipboardList}
                  title="No rubrics yet"
                  description="Create your first to start scoring interviews consistently."
                />
              </div>
            )}

            {list.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1">
                {list.map((r) => {
                  const active = r.id === editingId;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => loadForEdit(r)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                          active
                            ? "border-brand/40 bg-brand-soft"
                            : "border-transparent hover:bg-surface-2",
                        )}
                      >
                        <span className="truncate text-sm font-medium text-foreground">
                          {r.name}
                        </span>
                        <span className="truncate text-xs text-ink-3">
                          {r.competencies.length}{" "}
                          {r.competencies.length === 1 ? "competency" : "competencies"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section>
          <div className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">{editingId ? "EDITING" : "NEW RUBRIC"}</span>
            <h2 className="ap-h4">
              {editingId ? "Edit rubric" : "Compose a rubric"}
            </h2>

            <div className="mt-5 flex flex-col gap-5">
              <Field
                label="Name"
                htmlFor="rubric-name"
                error={showErrors ? nameError : null}
              >
                <Input
                  id="rubric-name"
                  value={name}
                  placeholder="e.g. Senior Backend Engineer"
                  aria-invalid={(showErrors && Boolean(nameError)) || undefined}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Competencies
                  </span>
                  <span className="text-xs font-mono uppercase tracking-wide text-ink-3">
                    Total weight: {weightTotal.toFixed(1)}
                  </span>
                </div>

                {rows.map((row) => {
                  const wErr = showErrors ? weightError(row) : null;
                  const wNum = Number(row.weight) || 0;
                  const pct =
                    weightTotal > 0 ? Math.min(100, (wNum / weightTotal) * 100) : 0;
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3"
                    >
                      <div className="flex items-start gap-2">
                        <Input
                          placeholder="Competency name (e.g. Concurrency)"
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
                                r.id === row.id
                                  ? { ...r, weight: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="ap-btn ap-btn-ghost ap-btn-sm shrink-0"
                          aria-label="Remove competency"
                          disabled={rows.length === 1}
                          onClick={() =>
                            setRows((cur) => cur.filter((r) => r.id !== row.id))
                          }
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>

                      {row.name.trim() && (
                        <div className="ap-bar">
                          <span className="name">share of total</span>
                          <span className="v">{pct.toFixed(0)}%</span>
                          <span className="t">
                            <i style={{ width: `${pct}%` }} />
                          </span>
                        </div>
                      )}

                      <Textarea
                        rows={2}
                        placeholder="Descriptor — what 'great' looks like here (local-only today)"
                        value={row.descriptor}
                        onChange={(e) =>
                          setRows((cur) =>
                            cur.map((r) =>
                              r.id === row.id
                                ? { ...r, descriptor: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />

                      {wErr && <p className="text-sm text-danger">{wErr}</p>}
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="ap-btn ap-btn-ghost ap-btn-sm self-start"
                  onClick={() => setRows((cur) => [...cur, blankRow()])}
                >
                  <Plus className="size-4" aria-hidden /> Add competency
                </button>

                <p className="text-xs text-ink-3">
                  Descriptors are kept locally until the rubric schema adds them — they
                  don&apos;t persist on save yet.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  className="ap-btn ap-btn-primary"
                  disabled={save.isPending || (showErrors && Boolean(nameError || namedRows.length === 0 || hasWeightError))}
                  onClick={onSave}
                >
                  {save.isPending && <Spinner className="size-4" />}
                  {editingId ? "Save changes" : "Create rubric"}
                </button>
                {editingId && (
                  <>
                    <button
                      type="button"
                      className="ap-btn ap-btn-ghost ap-btn-sm"
                      onClick={reset}
                    >
                      Cancel
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button
                          type="button"
                          className="ap-btn ap-btn-ghost ap-btn-sm text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden /> Delete rubric
                        </button>
                      }
                      title="Delete this rubric?"
                      description="Jobs still using it will fall back to the model default. This can't be undone."
                      confirmLabel="Delete"
                      destructive
                      busy={remove.isPending}
                      onConfirm={() => remove.mutate(editingId)}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </CompanyShell>
  );
}
