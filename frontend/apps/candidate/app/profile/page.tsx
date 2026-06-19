"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
  buttonVariants,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, isNotFound, useRequireAuth } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

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
  skills: string; // comma-separated in the form
  experience: Exp[];
  education: Edu[];
}

const EMPTY: Form = {
  fullName: "",
  age: 0,
  location: "",
  willingToRelocate: false,
  jobPreference: "",
  skills: "",
  experience: [],
  education: [],
};

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
// Resume parsing is async; cap the poll so a stuck parse offers an exit, not a forever
// spinner. ~75s at the 2.5s interval.
const MAX_PARSE_POLLS = 30;

export default function ProfilePage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const touched = useRef(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Count parse polls so a stuck extraction stops (and surfaces an exit) instead of
  // spinning forever. Reset whenever a fresh upload kicks off a new parse.
  const [parsePolls, setParsePolls] = useState(0);

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
    // While the resume is parsing, poll so the extracted data appears automatically —
    // but stop after MAX_PARSE_POLLS so a stuck parse doesn't spin forever.
    refetchInterval: (query) => {
      const p = query.state.data;
      const parsing = Boolean(p && p.resumeUploaded && !p.parsed);
      return parsing && parsePolls < MAX_PARSE_POLLS ? 2500 : false;
    },
  });

  const parsing = Boolean(profile.data?.resumeUploaded && !profile.data?.parsed);
  const parseStalled = parsing && parsePolls >= MAX_PARSE_POLLS;

  // Tick the poll counter on each fetch while parsing is still pending.
  useEffect(() => {
    if (parsing) setParsePolls((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.dataUpdatedAt]);

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
      skills: p.skills.join(", "),
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
      // A new upload starts a fresh parse — reset the poll budget.
      setParsePolls(0);
      toast.success("Resume uploaded — extracting your details…");
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
        skills: form.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      touched.current = false;
      setValidationError(null);
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!token) return null;

  const completeness = profile.data?.completeness ?? 0;

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
      toast.error("Resume must be under 10 MB");
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

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <PageHeader
        title="Your profile"
        description="Upload your resume and review the details we extract."
        action={
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        }
      />

      {profile.isLoading ? (
        <LoadingState label="Loading your profile…" />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <input
                  id="resume-file"
                  type="file"
                  aria-label="Upload resume"
                  accept={RESUME_ACCEPT}
                  onChange={onFile}
                  disabled={upload.isPending}
                  className="sr-only"
                />
                <label
                  htmlFor="resume-file"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "cursor-pointer",
                    upload.isPending && "pointer-events-none opacity-50",
                  )}
                >
                  <Upload className="size-4" aria-hidden />
                  Choose resume (PDF or Word)
                </label>
              </div>
              {upload.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Uploading…
                </p>
              )}
              {parsing && !parseStalled && (
                <Alert tone="info">
                  <span className="flex items-center gap-2">
                    <Spinner /> Extracting your experience, education and skills…
                  </span>
                </Alert>
              )}
              {parseStalled && (
                <Alert tone="warning">
                  Extraction is taking longer than expected. You can continue filling in
                  your details below, or re-upload your resume to try again.
                </Alert>
              )}
              {profile.data?.parsed && (
                <p className="text-sm text-muted-foreground">
                  Profile completeness: <strong>{completeness}%</strong>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="Full name" htmlFor="fullName">
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => update({ fullName: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Age" htmlFor="age">
                  <Input
                    id="age"
                    type="number"
                    min={16}
                    max={100}
                    step={1}
                    value={form.age || ""}
                    onChange={(e) => update({ age: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Location" htmlFor="location">
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-foreground">
                <Checkbox
                  checked={form.willingToRelocate}
                  onCheckedChange={(v) => update({ willingToRelocate: v === true })}
                />
                Willing to relocate
              </label>
              <Field label="Job preference">
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
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Skills (comma-separated)" htmlFor="skills">
                <Input
                  id="skills"
                  placeholder="python, sql, communication"
                  value={form.skills}
                  onChange={(e) => update({ skills: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Experience</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {form.experience.map((exp, i) => (
                <fieldset
                  key={exp._key}
                  className="flex flex-col gap-3 rounded-md border border-border p-3"
                >
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Experience {i + 1}
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      aria-label="Company"
                      placeholder="Company"
                      value={exp.company}
                      onChange={(e) =>
                        update({
                          experience: form.experience.map((x, j) =>
                            j === i ? { ...x, company: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label="Job title"
                      placeholder="Title"
                      value={exp.title}
                      onChange={(e) =>
                        update({
                          experience: form.experience.map((x, j) =>
                            j === i ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <Textarea
                    aria-label="What you did"
                    placeholder="What you did"
                    value={exp.summary}
                    onChange={(e) =>
                      update({
                        experience: form.experience.map((x, j) =>
                          j === i ? { ...x, summary: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leadingIcon={Trash2}
                    className="self-end text-danger hover:text-danger"
                    onClick={() =>
                      update({
                        experience: form.experience.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  update({
                    experience: [
                      ...form.experience,
                      { _key: crypto.randomUUID(), company: "", title: "", summary: "" },
                    ],
                  })
                }
              >
                Add experience
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Education</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {form.education.map((edu, i) => (
                <fieldset
                  key={edu._key}
                  className="flex flex-col gap-3 rounded-md border border-border p-3"
                >
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Education {i + 1}
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                    <Input
                      aria-label="Institution"
                      placeholder="Institution"
                      value={edu.institution}
                      onChange={(e) =>
                        update({
                          education: form.education.map((x, j) =>
                            j === i ? { ...x, institution: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
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
                    />
                    <Input
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
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leadingIcon={Trash2}
                    className="self-end text-danger hover:text-danger"
                    onClick={() =>
                      update({
                        education: form.education.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  update({
                    education: [
                      ...form.education,
                      { _key: crypto.randomUUID(), institution: "", degree: "", year: "" },
                    ],
                  })
                }
              >
                Add education
              </Button>
            </CardContent>
          </Card>

          {validationError && <Alert tone="danger">{validationError}</Alert>}

          <Button
            type="submit"
            disabled={save.isPending}
            loading={save.isPending}
            className="self-end"
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      )}
    </main>
  );
}
