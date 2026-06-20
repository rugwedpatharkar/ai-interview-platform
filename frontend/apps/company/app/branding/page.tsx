"use client";

import {
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
                onUploaded={(logoKey) => set("logoKey", logoKey)}
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
      )}
    </CompanyShell>
  );
}
