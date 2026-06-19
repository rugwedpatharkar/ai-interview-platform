# Screen: Company branding editor — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1).
> **Route:** `frontend/apps/company/app/branding/page.tsx` (NEW) · **Mockup:** `aptura_company_branding` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (TIER 5, Task 10)
> **Goal:** A recruiter edits the public company brand (display name, logo, about, website, locations, industry, size) shown on the marketplace company page. The **read side is shared with** [`company-profile.md`](./company-profile.md) (the candidate-facing `/companies/[id]` page); this screen owns the **write** side (`UpsertCompanyProfile` + `PresignLogoUpload`).

There is no company-profile concept today — the auth `companies` doc holds only plan/owner. This adds a **separate `company_profiles` collection** (the brand doc; the editor **never writes the auth `companies` doc**) plus a logo upload via **presigned PUT** (the résumé upload is gRPC-bytes, so presign is genuinely new — it reuses the résumé MIME/size **validation pattern**, not its transport).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.company_profile.v1` (`CompanyProfileService`) — new proto, servicer, resource, repo, collection.

**RPCs:**
```proto
// service: admin.company_profile.v1 — NEW
rpc GetCompanyProfile(GetCompanyProfileRequest) returns (CompanyProfile);     // manager — own comp brand (seed the editor)
rpc UpsertCompanyProfile(UpsertCompanyProfileRequest) returns (CompanyProfile); // manager — create/replace (1:1 unique comp_id)
rpc PresignLogoUpload(PresignLogoUploadRequest) returns (PresignLogoUploadResponse); // manager — mint a scoped PUT URL
// GetPublicCompanyProfile is the READ side owned by company-profile.md (anon, public subset).
```
```proto
message GetCompanyProfileRequest {}                 // comp_id from token
message UpsertCompanyProfileRequest {
  string display_name = 1; string logo_key = 2; string about = 3; string website = 4;
  repeated string locations = 5; string industry = 6; string size = 7;   // e.g. "11-50"
}
message CompanyProfile {
  string comp_id = 1; string display_name = 2; string logo_key = 3; string logo_url = 4; // logo_url = presigned GET (TTL) for preview
  string about = 5; string website = 6; repeated string locations = 7; string industry = 8; string size = 9;
}
message PresignLogoUploadRequest { string content_type = 1; int64 size = 2; }
message PresignLogoUploadResponse { string url = 1; string logo_key = 2; }  // url = presigned PUT; logo_key persisted via Upsert
```
- **Auth/scope:** bearer; all three **manager-scoped** (`company_admin`/`recruiter`) and **comp-scoped** — `comp_id` from the **token, never the request**. `Upsert` is 1:1 per `comp_id` (unique index → create-or-replace, never a second row).
- **Logo presign validation (the security boundary — mirror the résumé gate in `resources/profile.py`):**
  - **Content-type allowlist:** only `image/png`, `image/jpeg`, `image/webp` mint a URL. **SVG is rejected** (script-injection risk). Off-allowlist → `INVALID_ARGUMENT`.
  - **Size cap:** reject `size > logo_max_bytes` (~2 MB) **before** minting; the cap also rides as a presign `content-length-range` condition so the storage layer re-enforces it.
  - **Tenant-namespaced key:** the object key is built under the caller's `comp_id` (from the token) — e.g. `company-logos/{comp_id}/{uuid}.{ext}` — so a presign can never target another tenant's prefix.
  - The presigned PUT carries its own auth; the browser uploads the bytes directly (no token on that PUT).
- **Backed by:** `resources/company_profile.py` (`get`, `get_public`, `upsert`, `presign_logo_upload`) → `infra/repositories/company_profiles.py` (writes `company_profiles`, **never** the auth `companies` doc) → Mongo `company_profiles` (unique index `comp_id` from `infra/db.py`). `logo_url` is a presigned **GET** (TTL-clamped, like the existing `presigned_get_url` precedent in `main.py`/`ObjectStorage`) so the editor previews the just-uploaded logo without making the bucket public.
- **Config:** add `logo_max_bytes` (~2 MB) + `logo_allowed_content_types` (`{"image/png","image/jpeg","image/webp"}`) to `config.py`.
- **Proto delta / new files:** `src/admin/app/routes/pb/company_profile.proto` (NEW), `src/admin/app/routes/company_profile.py` (servicer), `src/admin/app/resources/company_profile.py`, `src/admin/app/infra/repositories/company_profiles.py`, `src/admin/app/model/company_profile.py`; register in `src/admin/app/routes/web.py`. After: `pnpm gen` + **add the `companyProfile` quad** to `frontend/packages/api-client/src/index.ts`.
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 10 (`CompanyProfileService` Get/Upsert/PresignLogoUpload + §3.4 logo validation).

**FE mock shape** (`frontend/apps/company/app/branding/branding-types.ts`) — the editor codes against this until `pnpm gen`:
```ts
export interface CompanyProfileDTO {
  compId: string; displayName: string; logoKey: string; logoUrl: string;  // logoUrl = presigned GET (may be "")
  about: string; website: string; locations: string[]; industry: string; size: string;
}
export interface PresignLogoResult { url: string; logoKey: string; }
export interface BrandingForm {
  displayName: string; about: string; website: string;
  locations: string[]; industry: string; size: string; logoKey: string;
}
// Client-side courtesy gate (the server presign is the real guard):
export const LOGO_ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
```

> **Integration seam:** the editor calls a small `branding-client.ts` interface (`getProfile`, `upsertProfile`, `presignLogo`). `makeMockBrandingClient()` returns fixtures + a fake presign (resolves a `data:`/blob URL so the preview renders offline). Swapping mock → real means binding those three methods to `api.companyProfile.getCompanyProfile/upsertCompanyProfile/presignLogoUpload` after `pnpm gen` — the page component is unchanged.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/company/app/branding/branding-types.ts` (the shape above)
- Create: `frontend/apps/company/app/branding/branding-client.ts` (interface + `makeMockBrandingClient()` + real binding)
- Create: `frontend/apps/company/lib/upload.ts` (`uploadViaPresign(presignFn, file)` — validate → presign → PUT → return `logoKey`)
- Create: `frontend/apps/company/components/logo-upload.tsx` (`"use client"` picker → `uploadViaPresign` → preview)
- Create: `frontend/apps/company/app/branding/page.tsx` (`"use client"` editor under `CompanyShell`)
- Create: `frontend/apps/company/lib/upload.test.ts` (validation gate: rejects SVG + oversize; happy path PUTs + returns `logoKey`)
- Modify: `frontend/apps/company/components/company-shell.tsx` (add `Branding` to `NAV`)

**Components:** new `LogoUpload`; reuse `@ip/ui` `Field`, `Input`, `Textarea`, `Select*`, `Button`, `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Avatar`, `Spinner`, `Alert`, `PageHeader`, `LoadingState`, `ErrorState`, `toast`. (Reuse the **résumé picker shape** from `candidate/app/profile/page.tsx`: `sr-only` file `input` + a `buttonVariants`-styled `label`.)
**Query keys:** `["company-profile"]` (seed the editor; invalidate after `upsert`).

### Task 1: `uploadViaPresign` helper (validation + PUT) — TDD, no React

- [ ] **Step 1: Write the failing test** — `frontend/apps/company/lib/upload.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { uploadViaPresign, LogoValidationError } from "./upload";

const png = (bytes = 100) => new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" });

describe("uploadViaPresign", () => {
  it("rejects SVG (script risk)", async () => {
    const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    await expect(uploadViaPresign(vi.fn(), svg)).rejects.toBeInstanceOf(LogoValidationError);
  });
  it("rejects oversize", async () => {
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "logo.png", { type: "image/png" });
    await expect(uploadViaPresign(vi.fn(), big)).rejects.toBeInstanceOf(LogoValidationError);
  });
  it("presigns then PUTs the bytes and returns logoKey", async () => {
    const presign = vi.fn().mockResolvedValue({ url: "https://s3/put", logoKey: "company-logos/c1/x.png" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const key = await uploadViaPresign(presign, png());
    expect(presign).toHaveBeenCalledWith({ contentType: "image/png", size: 100 });
    expect(fetchSpy).toHaveBeenCalledWith("https://s3/put", expect.objectContaining({ method: "PUT" }));
    expect(key).toBe("company-logos/c1/x.png");
    fetchSpy.mockRestore();
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/company test upload` → FAIL.
- [ ] **Step 3: Implement** `frontend/apps/company/lib/upload.ts`:
```ts
import { LOGO_ACCEPTED_MIME, LOGO_MAX_BYTES, type PresignLogoResult } from "../app/branding/branding-types";

export class LogoValidationError extends Error {}

/** Validate (MIME + size) → presign → PUT the bytes direct to storage → return the logo key.
 *  The presigned URL carries its own auth, so the PUT uses plain `fetch`, NOT authedFetch.
 *  Client validation is a courtesy; the server presign is the real guard. */
export async function uploadViaPresign(
  presign: (p: { contentType: string; size: number }) => Promise<PresignLogoResult>,
  file: File,
): Promise<string> {
  if (file.type && !LOGO_ACCEPTED_MIME.has(file.type))
    throw new LogoValidationError("Logo must be a PNG, JPG, or WEBP image.");
  if (file.size > LOGO_MAX_BYTES)
    throw new LogoValidationError("Logo must be 2 MB or smaller.");
  const { url, logoKey } = await presign({ contentType: file.type, size: file.size });
  const res = await fetch(url, { method: "PUT", body: file, headers: { "content-type": file.type } });
  if (!res.ok) throw new Error(`logo upload failed: ${res.status}`);
  return logoKey;
}
```
- [ ] **Step 4: Run test, verify it passes** — `--filter @ip/company test upload` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/company && git commit -m "feat(branding): uploadViaPresign logo helper (MIME/size gate + PUT)"`

### Task 2: `branding-client.ts` — interface + mock (build before the RPC lands)

- [ ] **Step 1:** Implement `frontend/apps/company/app/branding/branding-client.ts`:
```ts
import type { CompanyProfileDTO, PresignLogoResult, BrandingForm } from "./branding-types";

export interface BrandingClient {
  getProfile(): Promise<CompanyProfileDTO>;
  upsertProfile(form: BrandingForm): Promise<CompanyProfileDTO>;
  presignLogo(p: { contentType: string; size: number }): Promise<PresignLogoResult>;
}

export function makeMockBrandingClient(): BrandingClient {
  let doc: CompanyProfileDTO = {
    compId: "c1", displayName: "Northwind", logoKey: "", logoUrl: "",
    about: "We build delightful developer tools.", website: "https://northwind.example",
    locations: ["Remote", "Berlin"], industry: "Software", size: "11-50",
  };
  return {
    async getProfile() { return doc; },
    async upsertProfile(form) { doc = { ...doc, ...form }; return doc; },
    async presignLogo({ contentType }) {
      const ext = contentType.split("/")[1] ?? "png";
      return { url: "blob:mock-put", logoKey: `company-logos/c1/mock.${ext}` };
    },
  };
}

// Real binding (after `pnpm gen`), kept here so the page imports one `useBrandingClient()`:
// export function realBrandingClient(api: ApiClients): BrandingClient { return {
//   getProfile: () => api.companyProfile.getCompanyProfile({}),
//   upsertProfile: (f) => api.companyProfile.upsertCompanyProfile(f),
//   presignLogo: (p) => api.companyProfile.presignLogoUpload(p),
// }; }
export const USE_MOCK_BRANDING = process.env.NEXT_PUBLIC_MOCK === "1";
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(branding): BrandingClient interface + mock"`

### Task 3: `LogoUpload` component

- [ ] **Step 1:** Create `frontend/apps/company/components/logo-upload.tsx` (mirror the résumé picker: `sr-only` input + styled label; preview via `Avatar`/`img`; `Alert` on validation error; keep the file on failure so the user can retry):
```tsx
"use client";
import { Alert, Avatar, Spinner, buttonVariants, cn } from "@ip/ui";
import { useState } from "react";
import { uploadViaPresign, LogoValidationError } from "../lib/upload";
import type { PresignLogoResult } from "../app/branding/branding-types";

export function LogoUpload({
  initialUrl, presign, onUploaded,
}: {
  initialUrl?: string;
  presign: (p: { contentType: string; size: number }) => Promise<PresignLogoResult>;
  onUploaded: (logoKey: string, previewUrl: string) => void;
}) {
  const [preview, setPreview] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
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
      setError(err instanceof LogoValidationError ? err.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name="Logo" src={preview || undefined} size="lg" />
      <div className="flex flex-col gap-1.5">
        <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
          {busy ? <Spinner className="size-4" /> : null}
          {busy ? "Uploading…" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPick} disabled={busy} />
        </label>
        <span className="text-xs text-muted-foreground">PNG, JPG, or WEBP · up to 2 MB.</span>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean. Confirm `Avatar` accepts `src`, `buttonVariants` is exported, and `Alert`'s `tone` value (`danger`/`destructive`) against the real API; adjust if flagged.
- [ ] **Step 3: Commit** — `git commit -am "feat(branding): LogoUpload picker + preview"`

### Task 4: `branding/page.tsx` editor + nav

- [ ] **Step 1:** Create `frontend/apps/company/app/branding/page.tsx`:
```tsx
"use client";
import {
  Button, Card, CardContent, CardHeader, CardTitle, ErrorState, Field, Input, LoadingState,
  PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, toast,
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
const EMPTY: BrandingForm = { displayName: "", about: "", website: "", locations: [], industry: "", size: "", logoKey: "" };

export default function BrandingPage() {
  const { token } = useAuth();
  const client = makeMockBrandingClient(); // swap to realBrandingClient(api) after pnpm gen
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
    setForm({ displayName: d.displayName, about: d.about, website: d.website,
      locations: d.locations, industry: d.industry, size: d.size, logoKey: d.logoKey });
    setLocationsRaw(d.locations.join(", "));
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => client.upsertProfile({ ...form, locations: locationsRaw.split(",").map((s) => s.trim()).filter(Boolean) }),
    onSuccess: () => { toast.success("Brand saved"); qc.invalidateQueries({ queryKey: ["company-profile"] }); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set = <K extends keyof BrandingForm>(k: K, v: BrandingForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <CompanyShell>
      <PageHeader title="Company branding" description="How your company appears to candidates in the marketplace." />
      {profile.isLoading && <LoadingState />}
      {profile.isError && <ErrorState message={errorMessage(profile.error)} retry={() => profile.refetch()} />}
      {profile.data && (
        <Card>
          <CardHeader><CardTitle>Brand</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <LogoUpload
                initialUrl={profile.data.logoUrl}
                presign={client.presignLogo}
                onUploaded={(logoKey) => set("logoKey", logoKey)}
              />
              <Field label="Display name" htmlFor="dn">
                <Input id="dn" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
              </Field>
              <Field label="About" htmlFor="about">
                <Textarea id="about" rows={5} value={form.about} onChange={(e) => set("about", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website" htmlFor="web">
                  <Input id="web" type="url" placeholder="https://…" value={form.website} onChange={(e) => set("website", e.target.value)} />
                </Field>
                <Field label="Industry" htmlFor="ind">
                  <Input id="ind" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Locations" htmlFor="loc" hint="Comma-separated">
                  <Input id="loc" placeholder="Remote, Berlin" value={locationsRaw} onChange={(e) => setLocationsRaw(e.target.value)} />
                </Field>
                <Field label="Company size">
                  <Select value={form.size || undefined} onValueChange={(v) => set("size", v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Button type="submit" className="self-start" loading={save.isPending}>Save brand</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </CompanyShell>
  );
}
```
- [ ] **Step 2:** Add `Branding` to `NAV` in `frontend/apps/company/components/company-shell.tsx`:
```tsx
const NAV: NavLink[] = [
  { href: "/jobs", label: "Jobs" },
  { href: "/branding", label: "Branding" },   // NEW
  { href: "/rubrics", label: "Rubrics" },
  { href: "/analytics", label: "Analytics" },
  { href: "/talent", label: "Talent" },
];
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company build` clean; preview loop: load `/branding`, confirm the form seeds from the mock profile, edit display name/about/website/industry/locations/size, pick a logo (preview updates; SVG → inline `Alert`; oversize → `Alert`), Save → toast. Confirm `Branding` appears in the nav and is active on `/branding`. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(branding): company branding editor page + nav entry"`

### Task 5: Swap mock → real (after BE lands + `pnpm gen`)

- [ ] **Step 1:** After `CompanyProfileService` lands, run `npx pnpm@9.15.0 --filter @ip/api-client gen`; add the **`companyProfile` quad** to `frontend/packages/api-client/src/index.ts` (import `CompanyProfileService` from `./gen/company_profile_pb.js`; `export *`; `companyProfile: Client<typeof CompanyProfileService>` on `ApiClients`; `companyProfile: createClient(CompanyProfileService, transport)` in `clientsFromTransport`).
- [ ] **Step 2:** In `branding/page.tsx`, replace `makeMockBrandingClient()` with `realBrandingClient(api)` (uncomment the binding in `branding-client.ts`); confirm `presignLogo` returns `{ url, logoKey }` and the PUT lands. `--filter @ip/api-client typecheck` + `--filter @ip/company build` green.
- [ ] **Step 3: Commit** — `git commit -am "feat(branding): bind editor to CompanyProfileService"`

---

## C. States & acceptance
- **States:** profile query loading (`LoadingState`) / error (`ErrorState` + retry); logo upload busy (`Spinner` in the label) / validation error (`Alert` — SVG or oversize) / success (preview swaps to the new image); save pending (button spinner) / success (toast + `["company-profile"]` invalidation). First-run (no profile yet) → the editor opens on empty fields and `Upsert` creates the row.
- **Responsive:** website/industry and locations/size grids are `sm:grid-cols-2`, stacking at ~375px; the logo row wraps.
- **Dark mode:** tokens only — automatic.
- **A11y:** every field in a labelled `Field`; the file input is `sr-only` with a real `<label>` wrapper (keyboard + SR reachable); `Alert` announces validation failures.
- **Security:** logo upload is **double-gated** — client courtesy check (`LOGO_ACCEPTED_MIME` + `LOGO_MAX_BYTES`) and the server presign (allowlist + `content-length-range` + tenant-namespaced key). The editor writes only `company_profiles`, never the auth `companies` doc.
- **Acceptance:** matches `aptura_company_branding`; the **read DTO is the same** `CompanyProfileDTO`/public subset rendered by [`company-profile.md`](./company-profile.md); builds against the mock now and against `CompanyProfileService` after `pnpm gen` (only the client binding flips); `--filter @ip/company build` + `typecheck` green.
