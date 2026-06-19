import type { BrandingForm, CompanyProfileDTO, PresignLogoResult } from "./branding-types";

export interface BrandingClient {
  getProfile(): Promise<CompanyProfileDTO>;
  upsertProfile(form: BrandingForm): Promise<CompanyProfileDTO>;
  presignLogo(p: { contentType: string; size: number }): Promise<PresignLogoResult>;
}

// In-memory mock so the editor builds and runs before `CompanyProfileService` lands. The
// presign returns a tenant-namespaced key shaped like the real one; the page builds its
// own object-URL preview from the picked file, so no real bytes leave the browser.
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

// Real binding (after `pnpm gen`), kept here so the page imports one client factory:
// export function realBrandingClient(api: ApiClients): BrandingClient {
//   return {
//     getProfile: () => api.companyProfile.getCompanyProfile({}),
//     upsertProfile: (f) => api.companyProfile.upsertCompanyProfile(f),
//     presignLogo: (p) => api.companyProfile.presignLogoUpload(p),
//   };
// }
export const USE_MOCK_BRANDING = process.env.NEXT_PUBLIC_MOCK === "1";
