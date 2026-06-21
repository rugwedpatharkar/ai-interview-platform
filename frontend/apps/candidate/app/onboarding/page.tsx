"use client";

// First-run onboarding for a freshly-registered candidate. A 4-step wizard that writes
// partial-profile patches per step to the same `api.profile.updateProfile` RPC the full
// /profile page uses — so each step is a real persisted edit, not a synthetic local state.
// Progress is also mirrored to localStorage so a refresh resumes the candidate where they
// left off; the server stays the source of truth for the actual profile fields.

import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, isNotFound, useRequireAuth } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  FileText,
  type LucideIcon,
  MapPin,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";

// Persisted progress key — bumped if shape changes so old payloads are silently dropped.
const PROGRESS_KEY = "aptura.onboarding.progress.v1";

// Suggested chips for "areas of interest" — written to `skills` on save (the closest
// existing profile field). The candidate can refine on /profile later.
const INTEREST_CHIPS = [
  "Frontend",
  "Backend",
  "Mobile",
  "Data / ML",
  "Design",
  "Product",
  "DevOps / SRE",
  "Security",
  "QA",
  "Customer success",
];

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
// Resume parsing is async — cap the poll so a stuck parse offers an exit rather than a
// forever spinner. ~75s at the 2.5s interval (mirrors /profile).
const MAX_PARSE_POLLS = 30;

type Step = 1 | 2 | 3 | 4;
type WorkPref = "remote" | "hybrid" | "onsite" | "";

interface WizardData {
  interests: string[];
  location: string;
  workPref: WorkPref;
  willingToRelocate: boolean;
  consentScreening: boolean;
}

const EMPTY: WizardData = {
  interests: [],
  location: "",
  workPref: "",
  willingToRelocate: false,
  consentScreening: false,
};

export default function OnboardingPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>(EMPTY);
  const [parsePolls, setParsePolls] = useState(0);
  const hydrated = useRef(false);

  // Hydrate from localStorage exactly once on mount — server profile then fills any gaps
  // (so refreshing mid-wizard restores both the in-progress data and the step pointer).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { step?: Step; data?: Partial<WizardData> };
      if (parsed.step && parsed.step >= 1 && parsed.step <= 4) setStep(parsed.step);
      if (parsed.data) setData((d) => ({ ...d, ...parsed.data }));
    } catch {
      // Corrupt payload — wipe and start fresh.
      localStorage.removeItem(PROGRESS_KEY);
    }
  }, []);

  // Mirror progress to localStorage on every change so a tab refresh never loses
  // mid-wizard input. Server-side fields are still authoritative for the real profile.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ step, data }));
    } catch {
      // Quota / private-mode — ignore; the wizard still works in-memory.
    }
  }, [step, data]);

  // Profile read — used to seed defaults (e.g. parsed location/skills from a prior
  // /profile visit) and to drive the step-3 parse-state feedback.
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
    refetchInterval: (query) => {
      const p = query.state.data;
      const parsing = Boolean(p && p.resumeUploaded && !p.parsed);
      return parsing && parsePolls < MAX_PARSE_POLLS ? 2500 : false;
    },
  });

  const parsing = Boolean(profile.data?.resumeUploaded && !profile.data?.parsed);
  const parseStalled = parsing && parsePolls >= MAX_PARSE_POLLS;

  useEffect(() => {
    if (parsing) setParsePolls((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.dataUpdatedAt]);

  // Seed any fields the candidate has already filled on /profile so re-entering the
  // wizard doesn't ask them again. Server data wins over the localStorage stub once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    const p = profile.data;
    if (!p) return;
    seeded.current = true;
    setData((d) => ({
      ...d,
      interests: d.interests.length ? d.interests : p.skills.slice(0, 6),
      location: d.location || p.location,
      workPref:
        d.workPref || ((p.jobPreference as WorkPref) || ""),
      willingToRelocate: d.willingToRelocate || p.willingToRelocate,
    }));
  }, [profile.data]);

  // Partial save — we send every field every time (the RPC isn't a true patch) but we
  // mix server-known fields back in so an earlier step's data isn't wiped by a later one.
  const save = useMutation({
    mutationFn: (patch: Partial<{
      skills: string[];
      location: string;
      jobPreference: string;
      willingToRelocate: boolean;
    }>) => {
      const p = profile.data;
      return api.profile.updateProfile({
        fullName: p?.fullName ?? "",
        age: p?.age ?? 0,
        location: patch.location ?? p?.location ?? "",
        willingToRelocate: patch.willingToRelocate ?? p?.willingToRelocate ?? false,
        jobPreference: patch.jobPreference ?? p?.jobPreference ?? "",
        experience:
          p?.experience.map((e) => ({
            company: e.company,
            title: e.title,
            summary: e.summary,
          })) ?? [],
        education:
          p?.education.map((e) => ({
            institution: e.institution,
            degree: e.degree,
            year: e.year,
          })) ?? [],
        skills: patch.skills ?? p?.skills ?? [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      return api.profile.uploadResume({ data: buf, contentType: file.type });
    },
    onSuccess: () => {
      setParsePolls(0);
      toast.success("Resume uploaded — we're extracting your details.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("Resume must be under 10 MB");
      e.target.value = "";
      return;
    }
    if (file.type && !ACCEPTED_MIME.has(file.type)) {
      toast.error("Please upload a PDF or Word document");
      e.target.value = "";
      return;
    }
    upload.mutate(file, {
      onSuccess: () => {
        e.target.value = "";
      },
    });
  }

  function toggleInterest(name: string) {
    setData((d) =>
      d.interests.includes(name)
        ? { ...d, interests: d.interests.filter((x) => x !== name) }
        : { ...d, interests: [...d.interests, name] },
    );
  }

  async function advance() {
    // Persist what this step owns, then move on. The wizard waits for the write to
    // resolve so a network blip never leaves the candidate with a "looks saved" lie.
    try {
      if (step === 1) {
        await save.mutateAsync({ skills: data.interests });
        setStep(2);
      } else if (step === 2) {
        await save.mutateAsync({
          location: data.location.trim(),
          jobPreference: data.workPref,
          willingToRelocate: data.willingToRelocate,
        });
        setStep(3);
      } else if (step === 3) {
        // Step 3 is the resume — `uploadResume` already wrote the data. Just advance.
        setStep(4);
      } else {
        // Done — wipe progress and head to the dashboard.
        try {
          localStorage.removeItem(PROGRESS_KEY);
        } catch {
          /* ignore */
        }
        router.push("/");
      }
    } catch {
      // mutation already toasted via onError; stay on the step
    }
  }

  if (!token) return null;

  const canAdvance =
    step === 1
      ? data.interests.length > 0
      : step === 2
        ? Boolean(data.workPref) && data.location.trim().length > 0
        : step === 3
          ? Boolean(profile.data?.resumeUploaded)
          : data.consentScreening;

  return (
    <CandidateShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {/* Heading */}
        <div className="flex flex-col gap-2">
          <span className="ap-eyebrow">Welcome to Aptura</span>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Let&rsquo;s set up your profile.
          </h1>
          <p className="text-sm text-muted-foreground">
            Four short steps — about a minute. You can edit any of this later from your profile.
          </p>
        </div>

        {/* Progress strip — 4 segments, current step inherits --teal via the .ap-bar pattern. */}
        <ol
          className="grid grid-cols-4 gap-2"
          aria-label={`Step ${step} of 4`}
        >
          {([1, 2, 3, 4] as Step[]).map((n) => {
            const done = n < step;
            const current = n === step;
            return (
              <li key={n}>
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    done
                      ? "bg-[var(--teal-strong)]"
                      : current
                        ? "bg-[var(--teal)]"
                        : "bg-[var(--surface-3)]",
                  )}
                  aria-hidden
                />
                <span className="mt-2 block text-xs text-muted-foreground">
                  {n}.{" "}
                  {n === 1
                    ? "Interests"
                    : n === 2
                      ? "Where"
                      : n === 3
                        ? "Resume"
                        : "Confirm"}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Step body */}
        {step === 1 && (
          <StepShell
            icon={Sparkles}
            title="What kind of roles interest you?"
            hint="Pick a few — we&rsquo;ll surface matching openings. You can change this anytime."
          >
            <div className="flex flex-wrap gap-2">
              {INTEREST_CHIPS.map((c) => {
                const on = data.interests.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleInterest(c)}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-[color-mix(in_oklch,var(--teal)_40%,var(--line))] bg-[var(--teal-soft)] text-[var(--teal-strong)]"
                        : "border-border bg-surface text-foreground hover:bg-surface-muted",
                    )}
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                    {c}
                  </button>
                );
              })}
            </div>
            {data.interests.length === 0 && (
              <p className="text-xs text-muted-foreground">Pick at least one to continue.</p>
            )}
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            icon={MapPin}
            title="Where do you want to work?"
            hint="We&rsquo;ll match the work style and location preference to listings."
          >
            <Field label="City" htmlFor="loc">
              <Input
                id="loc"
                value={data.location}
                placeholder="e.g. Bengaluru, Berlin, Remote-first"
                onChange={(e) => setData((d) => ({ ...d, location: e.target.value }))}
              />
            </Field>
            <Field label="Work style">
              <RadioGroup
                value={data.workPref}
                onValueChange={(v) =>
                  setData((d) => ({ ...d, workPref: v as WorkPref }))
                }
                className="flex flex-col gap-2"
              >
                {([
                  ["remote", "Remote — work from anywhere"],
                  ["hybrid", "Hybrid — a few days in office"],
                  ["onsite", "On-site — in office daily"],
                ] as const).map(([value, label]) => (
                  <label
                    key={value}
                    htmlFor={`wp-${value}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm transition-colors hover:bg-surface-muted",
                      data.workPref === value &&
                        "border-primary bg-[var(--teal-soft)]",
                    )}
                  >
                    <RadioGroupItem value={value} id={`wp-${value}`} />
                    <span className="text-foreground">{label}</span>
                  </label>
                ))}
              </RadioGroup>
            </Field>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                className="mt-0.5"
                checked={data.willingToRelocate}
                onCheckedChange={(v) =>
                  setData((d) => ({ ...d, willingToRelocate: v === true }))
                }
              />
              <span>I&rsquo;m open to relocating for the right role.</span>
            </label>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            icon={FileText}
            title="Upload your resume"
            hint="We&rsquo;ll extract your experience and skills — you can edit anything we get wrong."
          >
            {profile.isLoading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : (
              <>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-surface-muted">
                  <Upload className="size-6 text-primary" aria-hidden />
                  <span className="font-medium text-foreground">
                    {profile.data?.resumeUploaded
                      ? "Replace your resume"
                      : "Choose a PDF or Word document"}
                  </span>
                  <span>Up to 10 MB.</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={onFile}
                    disabled={upload.isPending}
                  />
                </label>

                {/* Parse-state feedback — same three states as /profile (uploading,
                    parsing, parsed, stalled) but in compact alert form. */}
                {upload.isPending && (
                  <Alert tone="info">Uploading your resume&hellip;</Alert>
                )}
                {!upload.isPending && parsing && !parseStalled && (
                  <Alert tone="info">
                    Extracting your details &mdash; this usually takes a few seconds.
                  </Alert>
                )}
                {parseStalled && (
                  <Alert tone="warning">
                    Parsing is taking longer than expected. You can continue and fill in
                    details on the next screen, or
                    <Link href="/profile" className="ml-1 underline">
                      jump to your profile
                    </Link>
                    .
                  </Alert>
                )}
                {!upload.isPending &&
                  profile.data?.resumeUploaded &&
                  profile.data?.parsed && (
                    <Alert tone="success">
                      Resume parsed. We pulled your experience and skills &mdash; review on
                      the next step.
                    </Alert>
                  )}
                {!profile.data?.resumeUploaded && (
                  <p className="text-xs text-muted-foreground">
                    Don&rsquo;t have a resume handy? You can skip this and add one later from
                    your profile.
                  </p>
                )}
              </>
            )}
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            icon={Check}
            title="One last thing"
            hint="We use AI to screen interviews. You can review what we collect, and what we don't, anytime."
          >
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-success" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Every company answers.</span>{" "}
                  You&rsquo;ll always get a decision and explanation &mdash; no ghosting.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-success" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">No emotion inference.</span>{" "}
                  We don&rsquo;t score stress, confidence, or mood from your face or voice.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 text-success" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">Yours to delete.</span> You can
                  export or delete your data at any time.
                </span>
              </li>
            </ul>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={data.consentScreening}
                onCheckedChange={(v) =>
                  setData((d) => ({ ...d, consentScreening: v === true }))
                }
              />
              <span className="text-foreground">
                I consent to AI-assisted screening of my applications and interviews. See the{" "}
                <Link href="/privacy" className="underline">
                  privacy notice
                </Link>{" "}
                and{" "}
                <Link href="/what-we-dont-do" className="underline">
                  what we don&rsquo;t do
                </Link>
                .
              </span>
            </label>
          </StepShell>
        )}

        {/* Footer — back / skip / continue. "Skip for now" leaves whatever was saved so
            far in place; we wipe the localStorage progress because the wizard is dismissed. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)))}
                disabled={save.isPending}
              >
                Back
              </Button>
            )}
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                try {
                  localStorage.removeItem(PROGRESS_KEY);
                } catch {
                  /* ignore */
                }
                router.push("/");
              }}
            >
              Skip for now
            </button>
          </div>
          <Button
            type="button"
            onClick={() => void advance()}
            disabled={!canAdvance || save.isPending}
            loading={save.isPending}
          >
            {step === 4 ? "Done" : "Continue"}
            {step !== 4 && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </CandidateShell>
  );
}

/** A single step body — Aperture-flavoured cell with a leading icon + heading. */
function StepShell({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ap-cell ap-cell--anchor flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--teal-soft)] text-[var(--teal-strong)]">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
