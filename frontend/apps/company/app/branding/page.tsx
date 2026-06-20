"use client";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { CompanyShell } from "../../components/company-shell";
import { LogoUpload } from "../../components/logo-upload";
import { makeMockBrandingClient } from "./branding-client";
import type { BrandingForm } from "./branding-types";
import { useAuth } from "../../lib/auth";

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const EMPTY: BrandingForm = {
  displayName: "",
  about: "",
  website: "",
  locations: [],
  industry: "",
  size: "",
  logoKey: "",
};

export default function BrandingPage() {
  const { token } = useAuth();
  // Swap to realBrandingClient(api) after pnpm gen — the page component is unchanged.
  const client = makeMockBrandingClient();
  const qc = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(EMPTY);
  const [locationsRaw, setLocationsRaw] = useState("");
  // Presentational mirror of the picked/seeded logo URL for the live-preview card.
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
      <PageHeader
        title="Company branding"
        description="How your company appears to candidates in the marketplace."
      />
      {profile.isLoading && <LoadingState />}
      {profile.isError && (
        <ErrorState message={errorMessage(profile.error)} retry={() => profile.refetch()} />
      )}
      {profile.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Brand</CardTitle>
            </CardHeader>
            <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <LogoUpload
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
                  onChange={(e) => set("displayName", e.target.value)}
                />
              </Field>
              <Field label="About" htmlFor="about">
                <Textarea
                  id="about"
                  rows={5}
                  value={form.about}
                  onChange={(e) => set("about", e.target.value)}
                />
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
              <Button type="submit" className="self-start" loading={save.isPending}>
                Save brand
              </Button>
            </form>
            </CardContent>
          </Card>

          <BrandPreview form={form} locationsRaw={locationsRaw} logoUrl={logoPreview} />
        </div>
      )}
    </CompanyShell>
  );
}

/** Read-only marketplace mirror of the editor state — no new query or handler,
 * a pure render of the `form` the page already holds. */
function BrandPreview({
  form,
  locationsRaw,
  logoUrl,
}: {
  form: BrandingForm;
  locationsRaw: string;
  logoUrl: string;
}) {
  const locations = locationsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const name = form.displayName.trim() || "Your company";

  return (
    <Card className="h-fit lg:sticky lg:top-24">
      <CardHeader>
        <CardTitle className="text-base">Marketplace preview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={name} src={logoUrl || undefined} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight text-foreground">
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
          <div className="flex flex-wrap gap-1.5">
            {locations.map((loc) => (
              <Badge key={loc} tone="info" variant="subtle">
                {loc}
              </Badge>
            ))}
          </div>
        )}

        <p className="line-clamp-4 text-sm text-muted-foreground">
          {form.about.trim() || "Add an about section to tell candidates who you are."}
        </p>

        {form.website.trim() && (
          <p className="truncate text-sm text-primary">{form.website.trim()}</p>
        )}
      </CardContent>
    </Card>
  );
}
