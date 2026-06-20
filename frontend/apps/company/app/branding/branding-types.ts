// Typed shape for the company-branding editor. `CompanyProfileService` isn't in the proto
// yet — the editor codes against this until `pnpm gen`. Swapping mock → real binds the
// three client methods to api.companyProfile.* and leaves the page component unchanged.

export interface CompanyProfileDTO {
  compId: string;
  displayName: string;
  logoKey: string;
  logoUrl: string; // presigned GET for preview (may be "")
  about: string;
  website: string;
  locations: string[];
  industry: string;
  size: string;
}

export interface PresignLogoResult {
  url: string;
  logoKey: string;
}

export interface BrandingForm {
  displayName: string;
  about: string;
  website: string;
  locations: string[];
  industry: string;
  size: string;
  logoKey: string;
}

// Client-side courtesy gate — the server presign is the real guard (allowlist +
// content-length-range + tenant-namespaced key). SVG is rejected (script-injection risk).
export const LOGO_ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
