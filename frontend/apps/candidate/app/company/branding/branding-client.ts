// Authed company-branding editor client — wired 2026-06-21 to
// `admin.company_profile.v1.CompanyProfileService` on the admin transport.
//
// IMPORTANT: this is the AUTHED editor (Site A). The PUBLIC profile read consumed by
// /companies/[id] (SSR, crawlable) stays on `/public/companies/{id}` HTTP — do NOT route
// that through this client.
//
// Upload flow on save:
//   1. presignLogoUpload(content_type) → { uploadUrl, objectKey }
//   2. PUT the file bytes directly to `uploadUrl` (no auth header — the presigned URL
//      carries its own auth) using plain `fetch`, NOT authedFetch.
//   3. upsertCompanyProfile({ about, website, logo: objectKey, locations }).
//
// NEXT_PUBLIC_MOCK=1 falls back to an in-memory client for offline dev.

import { useMemo } from "react";
import type { AdminClients } from "@ip/api-client";
import { isNotFound } from "@ip/shared";

import { useAuth } from "../../../lib/auth";
import {
  LOGO_ACCEPTED_MIME,
  LOGO_MAX_BYTES,
  type BrandingForm,
  type CompanyProfileDTO,
  type PresignLogoResult,
} from "./branding-types";

export interface BrandingClient {
  getProfile(): Promise<CompanyProfileDTO>;
  upsertProfile(form: BrandingForm): Promise<CompanyProfileDTO>;
  presignLogo(p: { contentType: string; size: number }): Promise<PresignLogoResult>;
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

// In-memory mock so the editor builds and runs offline. Presign returns a tenant-namespaced
// key shaped like the real one; the page builds its own object-URL preview from the picked
// file, so no bytes actually leave the browser.
export function makeMockBrandingClient(): BrandingClient {
  let doc: CompanyProfileDTO = {
    compId: "c1",
    displayName: "",
    logoKey: "",
    logoUrl: "",
    about: "",
    website: "",
    locations: [],
    industry: "",
    size: "",
    accent: "teal",
  };
  return {
    async getProfile() {
      return doc;
    },
    async upsertProfile(form) {
      doc = { ...doc, ...form };
      return doc;
    },
    async presignLogo({ contentType }) {
      const ext = contentType.split("/")[1] ?? "png";
      return { url: "blob:mock-put", logoKey: `company-logos/c1/mock.${ext}` };
    },
  };
}

/** Real client backed by `admin.company_profile.v1.CompanyProfileService`. The proto's
 *  CompanyProfile only carries the public-shape fields (id/name/about/website/logo/locations
 *  + trust); industry/size/accent aren't on the wire yet (presentational-only in the editor),
 *  so they're held at the FE layer for the live-preview UI. */
export function makeApiBrandingClient(api: AdminClients): BrandingClient {
  return {
    async getProfile() {
      // comp_id is server-resolved from the token (BE comment: "comp-scoped from the token");
      // sending "" keeps the seam token-driven on the BE side.
      // NOT_FOUND is expected for a newly-registered company with no published presence —
      // surface an empty editable form so the recruiter can author their first branding.
      try {
        const p = await api.companyProfile.getCompanyProfile({ compId: "" });
        return {
          compId: p.id,
          displayName: p.name,
          logoKey: p.logo,
          logoUrl: p.logo,
          about: p.about,
          website: p.website,
          locations: p.locations,
          industry: "",
          size: "",
          accent: "teal",
        };
      } catch (err) {
        if (!isNotFound(err)) throw err;
        return {
          compId: "",
          displayName: "",
          logoKey: "",
          logoUrl: "",
          about: "",
          website: "",
          locations: [],
          industry: "",
          size: "",
          accent: "teal",
        };
      }
    },
    async upsertProfile(form) {
      const p = await api.companyProfile.upsertCompanyProfile({
        about: form.about,
        website: form.website,
        logo: form.logoKey,
        locations: form.locations,
      });
      return {
        compId: p.id,
        displayName: p.name,
        logoKey: p.logo,
        logoUrl: p.logo,
        about: p.about,
        website: p.website,
        locations: p.locations,
        // Keep the editor-only fields the form last carried (proto doesn't persist them yet).
        industry: form.industry,
        size: form.size,
        accent: form.accent,
      };
    },
    async presignLogo({ contentType }) {
      const r = await api.companyProfile.presignLogoUpload({ contentType });
      return { url: r.uploadUrl, logoKey: r.objectKey };
    },
  };
}

/** Hook: returns the live branding client (or the mock under NEXT_PUBLIC_MOCK). */
export function useBrandingClient(): BrandingClient {
  const { api } = useAuth();
  return useMemo(
    () => (USE_MOCK ? makeMockBrandingClient() : makeApiBrandingClient(api)),
    [api],
  );
}

export class LogoValidationError extends Error {}

// Validate (MIME + size) → presign → PUT direct to storage → return the logo key.
// The presigned URL carries its own auth — PUT uses plain `fetch`, NOT authedFetch.
export async function uploadViaPresign(
  presign: (p: { contentType: string; size: number }) => Promise<PresignLogoResult>,
  file: File,
): Promise<string> {
  if (file.type && !LOGO_ACCEPTED_MIME.has(file.type))
    throw new LogoValidationError("Logo must be a PNG, JPG, or WEBP image.");
  if (file.size > LOGO_MAX_BYTES)
    throw new LogoValidationError("Logo must be 2 MB or smaller.");
  const { url, logoKey } = await presign({ contentType: file.type, size: file.size });
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });
  if (!res.ok) throw new Error(`logo upload failed: ${res.status}`);
  return logoKey;
}
