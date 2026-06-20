"use client";

import {
  Alert,
  Avatar,
  Badge,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, MapPin } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";
import {
  LogoValidationError,
  uploadViaPresign,
  useBrandingClient,
} from "./branding-client";
import type { BrandingForm } from "./branding-types";

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

const EMPTY: BrandingForm = {
  displayName: "",
  about: "",
  website: "",
  locations: [],
  industry: "",
  size: "",
  logoKey: "",
  accent: "teal",
};

// Accent picker: the candidate marketplace uses --teal as the brand primary; companies pick
// one of three pre-approved hues so we never need to validate raw colour input.
const ACCENTS = [
  { id: "teal", label: "Teal", css: "var(--teal)" },
  { id: "coral", label: "Coral", css: "var(--coral)" },
  { id: "gold", label: "Gold", css: "var(--gold)" },
] as const;

// Company-branding editor. Two-column at lg+: form on the left (anchor cell), sticky live
// preview on the right. Preserves CompanyProfileService.GetCompanyProfile /
// UpsertCompanyProfile / PresignLogoUpload — swap mock → real at integration with no JSX edits.
export default function BrandingPage() {
  const { token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  const client = useBrandingClient();
  const qc = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(EMPTY);
  const [locationsRaw, setLocationsRaw] = useState("");
  const [logoPreview, setLogoPreview] = useState("");

  const profile = useAuthedQuery(token, {
    queryKey: ["company-profile"],
    queryFn: () => client.getProfile(),
  });

  useEffect(() => {
    if (!profile.data) return;
    const d = profile.data;
    setForm({
      displayName: d.displayName,
      about: d.about,
      website: d.website,
      locations: d.locations,
      industry: d.industry,
      size: d.size,
      logoKey: d.logoKey,
      accent: d.accent || "teal",
    });
    setLocationsRaw(d.locations.join(", "));
    setLogoPreview(d.logoUrl ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      client.upsertProfile({
        ...form,
        locations: locationsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("Brand saved");
      qc.invalidateQueries({ queryKey: ["company-profile"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set = <K extends keyof BrandingForm>(k: K, v: BrandingForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3">
        <p className="ap-eyebrow">Brand</p>
        <h1 className="ap-h2">How candidates see you.</h1>
        <p className="ap-lead text-base">
          Tune your marketplace presence — logo, accent, and the words that introduce you.
          Changes preview live before they ship.
        </p>
      </header>

      {profile.isLoading && <LoadingState />}
      {profile.isError && (
        <ErrorState message={errorMessage(profile.error)} retry={() => profile.refetch()} />
      )}
      {profile.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">EDITOR</span>
            <h2 className="ap-h4">Brand identity</h2>
            <form
              className="mt-5 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <LogoPicker
                initialUrl={profile.data.logoUrl}
                presign={client.presignLogo}
                onUploaded={(logoKey, previewUrl) => {
                  set("logoKey", logoKey);
                  setLogoPreview(previewUrl);
                }}
              />

              <Field label="Display name" htmlFor="dn">
                <Input
                  id="dn"
                  value={form.displayName}
                  placeholder="e.g. Aptura"
                  onChange={(e) => set("displayName", e.target.value)}
                />
              </Field>

              <Field
                label="About"
                htmlFor="about"
                hint="A short pitch. Appears on every job card and your company page."
              >
                <Textarea
                  id="about"
                  rows={5}
                  value={form.about}
                  placeholder="We help teams hire on proven merit…"
                  onChange={(e) => set("about", e.target.value)}
                />
              </Field>

              <Field label="Accent colour">
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={cn(
                        "ap-pill flex items-center gap-2",
                        form.accent === a.id && "ap-pill--teal ring-2 ring-ring",
                      )}
                      aria-pressed={form.accent === a.id}
                      onClick={() => set("accent", a.id)}
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ background: a.css }}
                        aria-hidden
                      />
                      {a.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website" htmlFor="web">
                  <Input
                    id="web"
                    type="url"
                    placeholder="https://…"
                    value={form.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </Field>
                <Field label="Industry" htmlFor="ind">
                  <Input
                    id="ind"
                    value={form.industry}
                    placeholder="Software"
                    onChange={(e) => set("industry", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Locations" htmlFor="loc" hint="Comma-separated">
                  <Input
                    id="loc"
                    placeholder="Remote, Berlin"
                    value={locationsRaw}
                    onChange={(e) => setLocationsRaw(e.target.value)}
                  />
                </Field>
                <Field label="Company size">
                  <Select value={form.size || undefined} onValueChange={(v) => set("size", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="ap-btn ap-btn-primary"
                  disabled={save.isPending}
                >
                  {save.isPending && <Spinner className="size-4" />}
                  {save.isPending ? "Saving…" : "Save brand"}
                </button>
                <span className="text-xs text-ink-3">
                  Career-page text persists immediately on save.
                </span>
              </div>
            </form>
          </div>

          <BrandPreview
            form={form}
            locationsRaw={locationsRaw}
            logoUrl={logoPreview}
          />
        </div>
      )}
    </CompanyShell>
  );
}

// Square preview (object-contain so a logo isn't cropped into a circle). The sr-only file
// input behind a styled <label> mirrors the candidate résumé picker pattern.
function LogoPicker({
  initialUrl,
  presign,
  onUploaded,
}: {
  initialUrl?: string;
  presign: (p: { contentType: string; size: number }) => Promise<{
    url: string;
    logoKey: string;
  }>;
  onUploaded: (logoKey: string, previewUrl: string) => void;
}) {
  const [preview, setPreview] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after an error
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const logoKey = await uploadViaPresign(presign, file);
      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);
      onUploaded(logoKey, localUrl);
    } catch (err) {
      setError(
        err instanceof LogoValidationError ? err.message : "Upload failed — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/60 p-4">
      {preview ? (
        <img
          src={preview}
          alt="Company logo preview"
          className="size-14 shrink-0 rounded-md border border-line bg-surface object-contain"
        />
      ) : (
        <div className="grid size-14 shrink-0 place-items-center rounded-md border border-dashed border-line bg-surface text-xs text-ink-3">
          Logo
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          className={cn(
            "ap-btn ap-btn-ghost ap-btn-sm cursor-pointer",
            busy && "pointer-events-none opacity-50",
          )}
        >
          {busy ? <Spinner className="size-4" /> : null}
          {busy ? "Uploading…" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onPick}
            disabled={busy}
          />
        </label>
        <span className="text-xs text-ink-3">PNG, JPG, or WEBP · up to 2 MB.</span>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </div>
  );
}

// Read-only marketplace mirror — pure render of the editor's current state. No new query,
// no handlers — the surface a candidate sees on /companies/[id].
function BrandPreview({
  form,
  locationsRaw,
  logoUrl,
}: {
  form: BrandingForm;
  locationsRaw: string;
  logoUrl: string;
}) {
  const locations = useMemo(
    () =>
      locationsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [locationsRaw],
  );
  const name = form.displayName.trim() || "Your company";
  const accent =
    form.accent === "coral"
      ? "var(--coral)"
      : form.accent === "gold"
        ? "var(--gold)"
        : "var(--teal)";

  return (
    <div className="ap-cell h-fit lg:sticky lg:top-24">
      <span className="ap-cell-tag">PREVIEW</span>
      <h2 className="ap-h4">Marketplace card</h2>

      <div
        className="mt-5 rounded-2xl border border-line bg-surface-2 p-5"
        style={{
          backgroundImage: `linear-gradient(135deg, color-mix(in oklch, ${accent} 8%, var(--surface)), var(--surface))`,
          borderColor: `color-mix(in oklch, ${accent} 18%, var(--line))`,
        }}
      >
        <div className="flex items-start gap-3">
          <Avatar name={name} src={logoUrl || undefined} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
              {name}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {form.industry.trim() && (
                <Badge tone="neutral" variant="subtle">
                  {form.industry.trim()}
                </Badge>
              )}
              {form.size.trim() && (
                <Badge tone="neutral" variant="subtle">
                  {form.size.trim()}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {locations.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
            {locations.map((loc) => (
              <span key={loc} className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {loc}
              </span>
            ))}
          </div>
        )}

        <p className="mt-4 line-clamp-5 text-sm leading-relaxed text-ink-2">
          {form.about.trim() || "Add an about section to tell candidates who you are."}
        </p>

        {form.website.trim() && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm">
            <Globe className="size-3.5" style={{ color: accent }} aria-hidden />
            <span className="truncate" style={{ color: accent }}>
              {form.website.trim()}
            </span>
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-3">
        This is what a candidate sees on your public profile.
      </p>
    </div>
  );
}
