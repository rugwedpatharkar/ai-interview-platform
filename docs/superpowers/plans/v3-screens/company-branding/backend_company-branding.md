# Backend — `company-branding` (Midnight v3)

> **Screen:** Company branding editor · **FE consumer:** [`frontend_company-branding.md`](./frontend_company-branding.md)
> **Status:** **EXISTING — reuse `CompanyProfileService`.** Restated from [`../../v2-screens/company-branding.md`](../../v2-screens/company-branding.md) §A (the write-side brand contract; the read subset is shared with `company-profile.md`). **No proto delta, no new collection, no new endpoint** — the Midnight redesign is appearance-only; this page consumes the same `admin.company_profile.v1` it targets today.
> **Real-vs-mock today:** **mock.** The editor codes against `makeMockBrandingClient()` (fixtures + a fake presign resolving a `blob:` URL so the preview renders offline). Swapping mock → real binds the three methods to `api.companyProfile.*` after `pnpm gen` — the page component is unchanged.

## Functionalities
- **Get** the company's own brand doc to seed the editor (display name, logo, about, website, locations, industry, size).
- **Upsert** (create-or-replace, 1:1 per `comp_id`) the brand doc on Save.
- **Presign a logo upload** — mint a scoped PUT URL after a server-side MIME + size gate, so the browser uploads the bytes directly.
- The brand doc is the **read side** of the candidate-facing `/companies/[id]` page; this screen owns the **write** side only.

## Service & RPCs (`admin.company_profile.v1` `CompanyProfileService`, gRPC-web — manager + comp-scoped)
| Function | RPC | Auth/scope |
|---|---|---|
| Seed the editor | `GetCompanyProfile(GetCompanyProfileRequest) → CompanyProfile` | manager (`company_admin`/`recruiter`); `comp_id` from token |
| Save brand | `UpsertCompanyProfile(UpsertCompanyProfileRequest) → CompanyProfile` | manager; 1:1 unique `comp_id` (create-or-replace) |
| Presign logo PUT | `PresignLogoUpload(PresignLogoUploadRequest) → PresignLogoUploadResponse` | manager; tenant-namespaced key |
| (Read side, elsewhere) | `GetPublicCompanyProfile` — owned by `company-profile.md` (anon, public subset) | public |

- **`comp_id` always from the token, never the request.** `Upsert` is 1:1 per `comp_id` (unique index → create-or-replace, never a second row). The editor writes **only** `company_profiles`, **never** the auth `companies` doc.

## Request / Response structures
- **`GetCompanyProfileRequest {}`** (comp_id from token) → **`CompanyProfile`**: `compId, displayName, logoKey, logoUrl, about, website, locations[], industry, size`. `logoUrl` = presigned **GET** (TTL-clamped) so the editor previews the uploaded logo without a public bucket.
- **`UpsertCompanyProfileRequest`**: `displayName, logoKey, about, website, locations[], industry, size` → returns the saved `CompanyProfile`.
- **`PresignLogoUploadRequest`**: `{ contentType: string, size: int64 }` → **`PresignLogoUploadResponse`**: `{ url: string (presigned PUT), logoKey: string (persisted via Upsert) }`.
- **FE mock shape** (`frontend/apps/company/app/branding/branding-types.ts`, camelCase per protobuf-es):
  ```ts
  interface CompanyProfileDTO { compId; displayName; logoKey; logoUrl; about; website; locations: string[]; industry; size; }
  interface PresignLogoResult { url; logoKey; }
  interface BrandingForm { displayName; about; website; locations: string[]; industry; size; logoKey; }
  const LOGO_ACCEPTED_MIME = new Set(["image/png","image/jpeg","image/webp"]);
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  ```
  The page binds to a small `branding-client.ts` interface (`getProfile`/`upsertProfile`/`presignLogo`); `makeMockBrandingClient()` returns fixtures + a fake presign; the real binding is `api.companyProfile.getCompanyProfile/upsertCompanyProfile/presignLogoUpload`.

## Data required
- **Collection:** `company_profiles` (the brand doc; unique index on `comp_id`). Reads/writes `displayName, logoKey, about, website, locations, industry, size`. `logoUrl` is derived (presigned GET, TTL-clamped) — not stored.
- **Object storage:** logo bytes under a tenant-namespaced key `company-logos/{comp_id}/{uuid}.{ext}` (from the token's `comp_id`, never the request prefix).
- **Config:** `logo_max_bytes` (~2 MB) + `logo_allowed_content_types` (`{"image/png","image/jpeg","image/webp"}`).

## Errors & edge cases
- **Logo presign is the security boundary** (mirror the résumé gate): off-allowlist content-type (incl. **SVG — script-injection risk**) → `INVALID_ARGUMENT`; `size > logo_max_bytes` → `INVALID_ARGUMENT` **before** minting (the cap also rides as a presign `content-length-range` condition). The browser PUT carries its own auth (no bearer on the PUT).
- Cross-tenant write attempt is structurally impossible — `comp_id` is taken from the token; the key prefix can never target another tenant.
- First-run (no profile yet) → the editor opens on empty fields; `Upsert` creates the row.
- `UNAVAILABLE`/network → surfaced as `errorMessage(err)` in the `ErrorState`/`toast.error` (existing behavior).

## Cross-references
- Restated contract: [`../../v2-screens/company-branding.md`](../../v2-screens/company-branding.md) §A.
- **Read side shares this DTO:** [`../../v2-screens/company-profile.md`](../../v2-screens/company-profile.md) (`GetPublicCompanyProfile` → public subset of `CompanyProfile`).
- Pillar: [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 10 (`CompanyProfileService` Get/Upsert/PresignLogoUpload + §3.4 logo validation).
