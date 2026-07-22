import { NextResponse, type NextRequest } from "next/server";

const ADMIN = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
const AIAGENTS = process.env.NEXT_PUBLIC_AIAGENTS_URL ?? "http://localhost:8081";
const isDev = process.env.NODE_ENV !== "production";

/**
 * Per-request CSP. Production issues a fresh nonce so `script-src` can drop
 * 'unsafe-inline' — Next reads the nonce off the request's CSP header and stamps
 * it onto its own bootstrap scripts. Any inline <script> we add (e.g. JSON-LD)
 * must carry the same nonce, readable from the `x-nonce` request header.
 *
 * Development keeps 'unsafe-inline' + 'unsafe-eval': Fast Refresh evaluates
 * modules with eval() and injects its own inline scripts, which a nonce policy
 * would break. The strict policy is therefore only exercised by a prod build.
 *
 * Note: a per-request nonce means the HTML differs per request, so routes are
 * dynamically rendered rather than statically cached. That is inherent to nonces.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    `connect-src 'self' ${ADMIN} ${AIAGENTS}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");

  // Next looks for the nonce on the *request* CSP header; the response header is
  // what the browser actually enforces. Both must carry the same value.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Documents only. Static assets are not documents, so CSP does not apply to them,
  // and matching them would burn middleware invocations on every chunk and font.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|icon.svg|apple-icon.svg).*)",
  ],
};
