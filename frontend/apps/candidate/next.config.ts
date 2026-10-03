import type { NextConfig } from "next";

// The Content-Security-Policy lives in middleware.ts, not here: it needs a fresh
// per-request nonce so production can drop `script-src 'unsafe-inline'`, which a
// static header cannot express. The headers below are request-invariant.

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@ip/ui", "@ip/api-client", "@ip/shared"],
  experimental: {
    // Widen the modularizeImports-style rewrite to every big barrel this app
    // imports from — Next tree-shakes the individual symbols at compile time,
    // so every page pays only for the icons/components it actually uses.
    optimizePackageImports: [
      "lucide-react",
      "@ip/ui",
      "@ip/shared",
      "@tanstack/react-query",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-label",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any) {
    // Workspace packages use `.js` import specifiers that resolve to `.ts` sources
    // (TS "Bundler" resolution); teach webpack to try `.ts`/`.tsx` for a `.js` import.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
