/** Terminal application states — the application won't transition further. */
export const TERMINAL_STATES = new Set([
  "withdrawn",
  "hired",
  "rejected",
  "expired",
  "abandoned",
]);

/** Current consent/terms version. */
export const TERMS_VERSION = "1.0";
