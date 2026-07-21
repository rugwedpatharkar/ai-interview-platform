"use client";

import {
  ApIcon,
  Alert,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, isNotFound, pollingBackoff, useRequireAuth, useRequireRole } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Trash2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { ExperienceRow } from "../../components/profile/experience-row";
import { SkillChips } from "../../components/profile/skill-chips";
import { useAuth } from "../../lib/auth";

interface Exp {
  _key: string;
  company: string;
  title: string;
  summary: string;
}
interface Edu {
  _key: string;
  institution: string;
  degree: string;
  year: string;
}
interface Form {
  fullName: string;
  age: number;
  location: string;
  willingToRelocate: boolean;
  jobPreference: string;
  skills: string[];
  experience: Exp[];
  education: Edu[];
}

const EMPTY: Form = {
  fullName: "",
  age: 0,
  location: "",
  willingToRelocate: false,
  jobPreference: "",
  skills: [],
  experience: [],
  education: [],
};

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
// Resume parsing is async; ~3 minutes of exponential backoff (500ms → 5s) then stops.
const resumeParseBackoff = pollingBackoff({
  initialMs: 500,
  capMs: 5_000,
  maxPolls: 24,
  jitterRatio: 0.2,
});

export default function ProfilePage() {
  const { api, token, identity, ready } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, ["candidate"], ready);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const touched = useRef(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Guard so the "still parsing" toast fires at most once per upload session.
  const parseToastFired = useRef(false);
  // Tracks how many successful fetches have happened during the current parse.
  const parsePolls = useRef(0);

  const profile = useQuery({
    queryKey: ["profile"],
    enabled: Boolean(token),
    queryFn: async () => {
      try {
        return await api.profile.getProfile({});
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    // Exponential backoff while the resume is parsing — stops automatically at
    // maxPolls (24) so a stuck parse doesn't spin forever.
    refetchInterval: (query) => {
      const p = query.state.data;
      const stillParsing = Boolean(p && p.resumeUploaded && !p.parsed);
      return stillParsing ? resumeParseBackoff(query) : false;
    },
  });

  const parsing = Boolean(
    profile.data?.resumeUploaded && !profile.data?.parsed,
  );

  // Tick the ref counter on each successful fetch while parsing is still pending.
  // Also fire the "still parsing" toast once at the 4th poll (~10 s of backoff).
  useEffect(() => {
    if (!parsing) return;
    parsePolls.current += 1;
    if (parsePolls.current === 4 && !parseToastFired.current) {
      parseToastFired.current = true;
      toast.info("Still parsing your resume — this can take a moment.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.dataUpdatedAt]);

  // maxPolls (24) exhausted while still parsing = stalled.
  const parseStalled = parsing && parsePolls.current >= 24;

  // Sync the form from the server unless the user has unsaved edits.
  useEffect(() => {
    const p = profile.data;
    if (!p || touched.current) return;
    setForm({
      fullName: p.fullName,
      age: p.age,
      location: p.location,
      willingToRelocate: p.willingToRelocate,
      jobPreference: p.jobPreference,
      skills: p.skills,
      experience: p.experience.map((e, i) => ({
        _key: `${e.company}-${e.title}-${i}`,
        company: e.company,
        title: e.title,
        summary: e.summary,
      })),
      education: p.education.map((e, i) => ({
        _key: `${e.institution}-${e.degree}-${i}`,
        institution: e.institution,
        degree: e.degree,
        year: e.year,
      })),
    });
  }, [profile.data]);

  function update(patch: Partial<Form>) {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
  }

  // Warn before leaving with unsaved edits — the form holds resume-parsed data the
  // candidate may have reviewed/corrected but not yet saved.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!touched.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = new Uint8Array(await file.arrayBuffer());
      return api.profile.uploadResume({ data, contentType: file.type });
    },
    onSuccess: () => {
      // A new upload starts a fresh parse — reset both guards.
      parseToastFired.current = false;
      parsePolls.current = 0;
      toast.success("Résumé uploaded — extracting your details…");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const save = useMutation({
    mutationFn: () =>
      api.profile.updateProfile({
        fullName: form.fullName,
        age: form.age,
        location: form.location,
        willingToRelocate: form.willingToRelocate,
        jobPreference: form.jobPreference,
        experience: form.experience,
        education: form.education,
        skills: form.skills,
      }),
    onSuccess: () => {
      touched.current = false;
      setValidationError(null);
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Completeness drives the anchor ring. Memoize so the ring doesn't re-animate on
  // unrelated form re-renders — only when the number changes.
  const completeness = profile.data?.completeness ?? 0;
  const ringStyle = useMemo(
    () => ({ "--pct": completeness } as React.CSSProperties),
    [completeness],
  );

  if (!token) return null;

  // A row counts as incomplete if it was started but is missing a required field —
  // company+title for experience, institution+degree for education.
  const expIncomplete = (e: Exp) => !e.company.trim() || !e.title.trim();
  const eduIncomplete = (e: Edu) => !e.institution.trim() || !e.degree.trim();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const badExp = form.experience.some(expIncomplete);
    const badEdu = form.education.some(eduIncomplete);
    if (badExp || badEdu) {
      setValidationError(
        "Some entries are missing required fields. Add a company and title for each experience, and an institution and degree for each education entry — or remove the empty ones.",
      );
      return;
    }
    setValidationError(null);
    save.mutate();
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("Résumé must be under 10 MB");
      e.target.value = "";
      return;
    }
    if (file.type && !ACCEPTED_MIME.has(file.type)) {
      toast.error("Please upload a PDF or Word document");
      e.target.value = "";
      return;
    }
    // Keep the chosen file in the input on failure so the candidate can retry without
    // re-picking; only clear it once the upload succeeds.
    upload.mutate(file, {
      onSuccess: () => {
        e.target.value = "";
      },
    });
  }

  const parsed = Boolean(profile.data?.parsed);
  const resumeUploaded = Boolean(profile.data?.resumeUploaded);
  const completenessHint =
    completeness >= 100
      ? "Your profile is complete — you'll get the best matches."
      : completeness >= 60
        ? "Almost there — add any missing experience or skills."
        : "Add your experience, education and skills to improve your matches.";

  return (
    <CandidateShell>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ap-eyebrow">Profile</p>
            <h1 className="ap-h2 mt-2">Your profile</h1>
            <p className="ap-lead mt-2 text-base">
              Upload your résumé and review what we extract. Recruiters see the same
              picture you do — what you save is what they see.
            </p>
          </div>
          <button
            type="submit"
            form="profile-form"
            disabled={save.isPending}
            className={cn(
              "ap-btn ap-btn-primary shrink-0",
              save.isPending && "cursor-not-allowed opacity-60",
            )}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </header>

        {profile.isLoading ? (
          <LoadingState label="Loading your profile…" />
        ) : profile.isError ? (
          <ErrorState
            message={errorMessage(profile.error)}
            retry={() => profile.refetch()}
          />
        ) : (
          <form
            id="profile-form"
            onSubmit={onSubmit}
            className="flex flex-col gap-6"
          >
            {/* Anchor row — completeness ring + résumé status + upload, side-by-side. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
              {/* Completeness ring as the page's focal point */}
              <div className="ap-cell ap-cell--anchor">
                <span className="ap-cell-tag">A · 01</span>
                <p className="ap-eyebrow">Completeness</p>
                <div className="mt-4 flex items-center gap-5">
                  <div
                    className="ap-ring shrink-0"
                    style={ringStyle}
                    aria-label={`Profile completeness ${completeness}%`}
                    role="img"
                  >
                    <span className="ap-ring-v tabular-nums">
                      {completeness}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="ap-h3 text-lg">
                      {completeness >= 100
                        ? "All set."
                        : completeness >= 60
                          ? "Almost there."
                          : "Just getting started."}
                    </p>
                    <p className="mt-1 text-sm text-ink-2">{completenessHint}</p>
                  </div>
                </div>
              </div>

              {/* Résumé status + upload */}
              <div className="ap-cell">
                <span className="ap-cell-tag">A · 02</span>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                      <FileText className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-medium text-foreground">
                        {resumeUploaded ? "Your résumé" : "Upload your résumé"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {resumeUploaded
                          ? "We extract your experience, education & skills with AI."
                          : "PDF or Word — we'll fill in the rest."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {parsed && (
                      <span className="ap-pill ap-pill--good">
                        <CheckCircle2 className="size-3" aria-hidden />
                        Parsed
                      </span>
                    )}
                    {(parsing || upload.isPending) && !parseStalled && (
                      <span className="ap-pill ap-pill--teal">
                        <Spinner />
                        {upload.isPending ? "Uploading" : "Parsing"}
                      </span>
                    )}
                    <input
                      id="resume-file"
                      type="file"
                      aria-label="Upload résumé"
                      accept={RESUME_ACCEPT}
                      onChange={onFile}
                      disabled={upload.isPending}
                      className="sr-only"
                    />
                    <label
                      htmlFor="resume-file"
                      className={cn(
                        "ap-btn ap-btn-ghost ap-btn-sm cursor-pointer",
                        upload.isPending && "pointer-events-none opacity-50",
                      )}
                    >
                      <Upload className="size-4" aria-hidden />
                      {resumeUploaded ? "Replace" : "Choose file"}
                    </label>
                  </div>
                </div>
                {parseStalled && (
                  <Alert tone="warning" className="mt-3">
                    Extraction is taking longer than expected. Keep filling in your
                    details below, or re-upload to try again.
                  </Alert>
                )}
              </div>
            </div>

            {/* Basics */}
            <div className="ap-cell">
              <span className="ap-cell-tag">B · BASICS</span>
              <h2 className="ap-h3 text-xl">Basics</h2>
              <p className="mt-1 text-sm text-ink-2">
                The minimum we need to introduce you. Used on every application.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-ink-2">Full name</span>
                  <input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => update({ fullName: e.target.value })}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-ink-2">Age</span>
                  <input
                    id="age"
                    type="number"
                    min={16}
                    max={100}
                    step={1}
                    value={form.age || ""}
                    onChange={(e) => update({ age: Number(e.target.value) })}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-ink-2">Location</span>
                  <input
                    id="location"
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    placeholder="City, Country"
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-ink-2">Job preference</span>
                  <Select
                    value={form.jobPreference || undefined}
                    onValueChange={(v) => update({ jobPreference: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                      <SelectItem value="onsite">On-site</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.willingToRelocate}
                  onChange={(e) =>
                    update({ willingToRelocate: e.target.checked })
                  }
                  className="size-4 rounded border-line accent-[var(--brand)]"
                />
                Willing to relocate
              </label>
            </div>

            {/* Skills */}
            <div className="ap-cell">
              <span className="ap-cell-tag">B · SKILLS</span>
              <h2 className="ap-h3 text-xl">Skills</h2>
              <p className="mt-1 text-sm text-ink-2">
                What you actually use day-to-day. Press Enter or comma to add.
              </p>
              <div className="mt-5">
                <SkillChips
                  value={form.skills}
                  onChange={(skills) => update({ skills })}
                />
              </div>
            </div>

            {/* Experience */}
            <div className="ap-cell">
              <span className="ap-cell-tag">B · EXPERIENCE</span>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="ap-h3 text-xl">Experience</h2>
                <span
                  className="text-xs text-ink-3"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {form.experience.length} role
                  {form.experience.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                {form.experience.map((exp, i) => (
                  <ExperienceRow
                    key={exp._key}
                    index={i}
                    value={exp}
                    onChange={(patch) =>
                      update({
                        experience: form.experience.map((x, j) =>
                          j === i ? { ...x, ...patch } : x,
                        ),
                      })
                    }
                    onRemove={() =>
                      update({
                        experience: form.experience.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update({
                      experience: [
                        ...form.experience,
                        {
                          _key: crypto.randomUUID(),
                          company: "",
                          title: "",
                          summary: "",
                        },
                      ],
                    })
                  }
                  className="ap-btn ap-btn-ghost ap-btn-sm self-start"
                >
                  Add experience
                </button>
              </div>
            </div>

            {/* Education */}
            <div className="ap-cell">
              <span className="ap-cell-tag">B · EDUCATION</span>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="ap-h3 text-xl">Education</h2>
                <span
                  className="text-xs text-ink-3"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {form.education.length} entr
                  {form.education.length === 1 ? "y" : "ies"}
                </span>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                {form.education.map((edu, i) => (
                  <fieldset
                    key={edu._key}
                    className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
                  >
                    <legend className="px-1 text-xs font-medium text-ink-3">
                      Education {i + 1}
                    </legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                      <input
                        aria-label="Institution"
                        placeholder="Institution"
                        value={edu.institution}
                        onChange={(e) =>
                          update({
                            education: form.education.map((x, j) =>
                              j === i
                                ? { ...x, institution: e.target.value }
                                : x,
                            ),
                          })
                        }
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        aria-label="Degree"
                        placeholder="Degree"
                        value={edu.degree}
                        onChange={(e) =>
                          update({
                            education: form.education.map((x, j) =>
                              j === i ? { ...x, degree: e.target.value } : x,
                            ),
                          })
                        }
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        aria-label="Year"
                        placeholder="Year"
                        value={edu.year}
                        onChange={(e) =>
                          update({
                            education: form.education.map((x, j) =>
                              j === i ? { ...x, year: e.target.value } : x,
                            ),
                          })
                        }
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          education: form.education.filter((_, j) => j !== i),
                        })
                      }
                      className="ap-btn ap-btn-ghost ap-btn-sm self-end text-[color:var(--danger)]"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update({
                      education: [
                        ...form.education,
                        {
                          _key: crypto.randomUUID(),
                          institution: "",
                          degree: "",
                          year: "",
                        },
                      ],
                    })
                  }
                  className="ap-btn ap-btn-ghost ap-btn-sm self-start"
                >
                  Add education
                </button>
              </div>
            </div>

            {validationError && (
              <Alert tone="danger">{validationError}</Alert>
            )}

            <div className="flex items-center justify-end gap-3">
              <p className="text-xs text-ink-3">
                <ApIcon
                  name="lock"
                  className="mr-1 inline size-3 text-ink-3 align-text-bottom"
                />
                Only employers you apply to can see this.
              </p>
              <button
                type="submit"
                disabled={save.isPending}
                className={cn(
                  "ap-btn ap-btn-primary",
                  save.isPending && "cursor-not-allowed opacity-60",
                )}
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </CandidateShell>
  );
}
