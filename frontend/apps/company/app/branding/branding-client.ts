import type { useAuth } from "../../lib/auth";
import type { BrandingForm, CompanyProfileDTO, PresignLogoResult } from "./branding-types";

export interface BrandingClient {
  getProfile(): Promise<CompanyProfileDTO>;
  upsertProfile(form: BrandingForm): Promise<CompanyProfileDTO>;
  presignLogo(p: { contentType: string; size: number }): Promise<PresignLogoResult>;
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

type Api = ReturnType<typeof useAuth>["api"];

// Live client backed by CompanyProfileService (generated). The proto's CompanyProfile
// message has: id, name, about, website, logo (URL), locations. It does NOT yet carry
// displayName (separate from name), industry, or size — those fields are missing from the
// UpsertCompanyProfileRequest proto. The page preserves those fields locally but they are
// not round-tripped to the server until the proto is extended.
// TODO(backend): add display_name, industry, size to company_profile.proto + UpsertRequest.
export function createBrandingClient(api: Api): BrandingClient {
  const cp = api.companyProfile;
  return {
    async getProfile() {
      const r = await cp.getCompanyProfile({ compId: "" });
      return {
        compId: r.id,
        displayName: r.name,
        logoKey: "",        // server returns a URL (r.logo), not the storage key
        logoUrl: r.logo,
        about: r.about,
        website: r.website,
        locations: r.locations,
        industry: "",       // not yet in proto — see TODO above
        size: "",           // not yet in proto — see TODO above
      };
    },
    async upsertProfile(form) {
      // industry / size / displayName not in UpsertCompanyProfileRequest yet.
      const r = await cp.upsertCompanyProfile({
        about: form.about,
        website: form.website,
        logo: form.logoKey,
        locations: form.locations,
      });
      return {
        compId: r.id,
        displayName: r.name,
        logoKey: form.logoKey,
        logoUrl: r.logo,
        about: r.about,
        website: r.website,
        locations: r.locations,
        industry: form.industry,
        size: form.size,
      };
    },
    async presignLogo({ contentType }) {
      const r = await cp.presignLogoUpload({ contentType });
      return { url: r.uploadUrl, logoKey: r.objectKey };
    },
  };
}

// In-memory mock so the editor builds and runs when NEXT_PUBLIC_MOCK=1.
export function makeMockBrandingClient(): BrandingClient {
  let doc: CompanyProfileDTO = {
    compId: "c1",
    displayName: "Northwind",
    logoKey: "",
    logoUrl: "",
    about: "We build delightful developer tools.",
    website: "https://northwind.example",
    locations: ["Remote", "Berlin"],
    industry: "Software",
    size: "11-50",
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
