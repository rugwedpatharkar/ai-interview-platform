# Company branding — Backend contract (v3 · frozen)

> **Screen.** `/company/branding` company branding editor. **FE consumer:** [`frontend_company-branding.md`](./frontend_company-branding.md).
> **Status:** **EXISTING — reuse `admin.company_profile.v1.CompanyProfileService`.** Restated from
> [`../../v2-screens/company-branding.md`](../../v2-screens/company-branding.md) §A (the write-side
> brand contract; the read subset is shared with `company-profile.md`). The Aperture Pro v3
> redesign is **appearance-only** — no proto delta, no new collection, no new endpoint beyond what
> v2 already ships.
> **Anti-fiction reminder:** Aptura is pre-launch. The editor surfaces only what the recruiter
> typed, never a fabricated "Sample company" placeholder card. Empty fields render truthful inline
> hints ("Add a display name to preview"), never invented content. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **mock.** The editor codes against `makeMockBrandingClient()` (fixtures
> + a fake presign resolving a `blob:` URL so the preview renders offline). Swapping mock → real
> binds the three methods to `api.companyProfile.*` after `pnpm gen` — the components are
> unchanged.

## Functionalities

- **Get** the company's own brand doc to seed the editor (display name, logo, about, website,
  locations, industry, size).
- **Upsert** (create-or-replace, 1:1 per `comp_id`) the brand doc on Save.
- **Presign a logo upload** — mint a scoped PUT URL after a server-side MIME + size gate, so the
  browser uploads the bytes directly.
- The brand doc is the **read side** of the candidate-facing `/companies/[id]` page; this screen
  owns the **write** side only. The public-read RPC lives on
  [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md).

## Service & RPCs

`admin.company_profile.v1.CompanyProfileService` (gRPC-web). All **bearer-auth, manager-scoped**
(`company_admin` / `recruiter`); `comp_id` derived from the **token, never the request**.

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| Seed the editor | `CompanyProfileService.GetCompanyProfile({}) → CompanyProfile` | EXISTING | manager + comp-scoped, read-only |
| Save brand | `CompanyProfileService.UpsertCompanyProfile({...}) → CompanyProfile` | EXISTING | manager + comp-scoped; 1:1 unique `comp_id` (create-or-replace) |
| Presign logo PUT | `CompanyProfileService.PresignLogoUpload({contentType, size}) → { url, logoKey }` | EXISTING | manager + comp-scoped; tenant-namespaced key |
| (Read side, elsewhere) | `GetPublicCompanyProfile` — owned by [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md) (anon, public subset) | EXISTING | public |

- **`comp_id` is always from the token, never the request.** `Upsert` is 1:1 per `comp_id` (unique
  index → create-or-replace, never a second row). The editor writes **only** `company_profiles`,
  **never** the auth `companies` doc.

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`GetCompanyProfileRequest {}`** (comp_id from token) → **`CompanyProfile`**:
  `{ compId, displayName, logoKey, logoUrl, about, website, locations: string[], industry, size }`.
  `logoUrl` = presigned **GET** (TTL-clamped) so the editor previews the uploaded logo without a
  public bucket.
- **`UpsertCompanyProfileRequest`**:
  `{ displayName, logoKey, about, website, locations: string[], industry, size }` → returns the
  saved `CompanyProfile` (`compId` always derived server-side).
- **`PresignLogoUploadRequest`**: `{ contentType: string, size: int64 }` →
  **`PresignLogoUploadResponse`**: `{ url: string /*presigned PUT*/, logoKey: string /*persisted via Upsert*/ }`.
- **FE mock shape** (`apps/company/app/branding/branding-types.ts`):
  ```ts
  export interface CompanyProfileDTO {
    compId: string;
    displayName: string;
    logoKey: string;
    logoUrl: string;
    about: string;
    website: string;
    locations: string[];
    industry: string;
    size: string;
  }
  export interface PresignLogoResult { url: string; logoKey: string; }
  export interface BrandingForm {
    displayName: string;
    about: string;
    website: string;
    locations: string[];
    industry: string;
    size: string;
    logoKey: string;
  }
  export const LOGO_ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
  export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  ```
  The page binds to a small `branding-client.ts` interface
  (`getProfile` / `upsertProfile` / `presignLogo`); `makeMockBrandingClient()` returns fixtures +
  a fake presign; the real binding is `api.companyProfile.{getCompanyProfile, upsertCompanyProfile,
  presignLogoUpload}` after `pnpm gen`.

## Data required

- **Collection:** `company_profiles` (the brand doc; unique index on `comp_id`). Reads/writes
  `displayName, logoKey, about, website, locations, industry, size`. `logoUrl` is derived
  (presigned GET, TTL-clamped) — not stored.
- **Object storage:** logo bytes under a tenant-namespaced key
  `company-logos/{comp_id}/{uuid}.{ext}` (from the token's `comp_id`, never the request prefix).
- **Config:** `logo_max_bytes` (~2 MB) + `logo_allowed_content_types`
  (`{"image/png", "image/jpeg", "image/webp"}`).

## Errors & edge cases

- **Logo presign is the security boundary** (mirrors the résumé gate):
  - off-allowlist content-type (including **SVG — script-injection risk**) → `INVALID_ARGUMENT`;
  - `size > logo_max_bytes` → `INVALID_ARGUMENT` **before** minting (the cap also rides as a
    presign `content-length-range` condition);
  - The browser PUT carries its own auth (no bearer on the PUT).
- **Cross-tenant write attempt** is structurally impossible — `comp_id` is taken from the token;
  the key prefix can never target another tenant.
- **First-run (no profile yet)** → the editor opens on empty fields; `Upsert` creates the row.
- **`UNAVAILABLE` / network** → surfaced as `errorMessage(err)` in the `ErrorState` / `toast.error`.
- **No fake placeholder content.** When fields are empty, the preview shows truthful inline hints
  — never a fabricated "Sample company" card or a fake "Acme Inc." default.

## Cross-references

- Restated contract: [`../../v2-screens/company-branding.md`](../../v2-screens/company-branding.md) §A.
- **Read side shares this DTO:**
  [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md)
  (`GetPublicCompanyProfile` → public subset of `CompanyProfile`).
- Pillar: [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 10
  (`CompanyProfileService` Get / Upsert / PresignLogoUpload + §3.4 logo validation).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
