import type { NextConfig } from "next";

const ADMIN = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";
const isDev = process.env.NODE_ENV !== "production";

// Defense-in-depth for the localStorage-token tradeoff (see frontend/README.md
// "Security notes"): a strict CSP narrows the XSS surface. `script-src 'unsafe-inline'`
// is required for Next's bootstrap; strict per-request nonces are a documented follow-up.
// ai-agents is permitted for the recruiting-assistant chat SSE stream.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${ADMIN} ${AIAGENTS}`,
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Next dev (Fast Refresh/HMR) evaluates modules with eval(); the prod build does not,
  // so 'unsafe-eval' is added only in development.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  transpilePackages: ["@ip/ui", "@ip/api-client", "@ip/shared"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
