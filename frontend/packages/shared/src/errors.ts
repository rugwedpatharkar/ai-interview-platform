import { Code, ConnectError } from "@connectrpc/connect";

// Friendly fallback copy per gRPC status. For validation-style codes we prefer the server's
// own message (it's written for users, e.g. "age must be between 16 and 100").
const FALLBACK: Partial<Record<Code, string>> = {
  [Code.Unauthenticated]: "Please sign in again.",
  [Code.PermissionDenied]: "You don't have access to that.",
  [Code.NotFound]: "Not found.",
  [Code.AlreadyExists]: "That already exists.",
  [Code.ResourceExhausted]: "Too many attempts — please wait a moment and try again.",
  [Code.Unavailable]: "Can't reach the server. Check your connection and try again.",
  [Code.Internal]: "Something went wrong. Please try again.",
};

const PREFER_SERVER_MESSAGE = new Set<Code>([
  Code.InvalidArgument,
  Code.FailedPrecondition,
  Code.AlreadyExists,
]);

export function errorMessage(err: unknown): string {
  if (err instanceof ConnectError) {
    if (PREFER_SERVER_MESSAGE.has(err.code) && err.rawMessage) return err.rawMessage;
    return FALLBACK[err.code] ?? err.rawMessage ?? "Something went wrong.";
  }
  // A bare network failure (fetch rejects with a TypeError) gets a connection-style
  // message instead of the raw "Failed to fetch".
  if (isNetworkError(err)) return "Can't reach the server. Check your connection and try again.";
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function isCode(err: unknown, code: Code): boolean {
  return err instanceof ConnectError && err.code === code;
}

// A failed fetch (DNS/offline/CORS/abort) rejects with a TypeError — there is no response.
// Treat that as transient/retryable. (The OAuth cookie-refresh in transport.ts is the only
// remaining raw fetch; every other call is gRPC and surfaces a ConnectError.)
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function isNotFound(err: unknown): boolean {
  return isCode(err, Code.NotFound);
}

/** Transient/retryable errors — e.g. keep polling an async result through a blip. */
export function isTransient(err: unknown): boolean {
  if (
    isCode(err, Code.Unavailable) ||
    isCode(err, Code.Internal) ||
    isCode(err, Code.Unknown)
  ) {
    return true;
  }
  return isNetworkError(err);
}
