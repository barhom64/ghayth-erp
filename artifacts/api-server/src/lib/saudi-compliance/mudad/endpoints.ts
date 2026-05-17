/**
 * URL builder for the Mudad API.
 *
 * Spec reference: Mudad (مدد) is the Ministry of Human Resources
 * platform for payroll settlement, leave-without-pay registration,
 * exit/re-entry tracking, and contract terminations. The exact URLs
 * depend on the customer's onboarding tier — sandbox vs production.
 *
 * Defaults below match the published Mudad gateway at the time this
 * module was written; both can be overridden via env vars
 * (MUDAD_SANDBOX_URL / MUDAD_PROD_URL) for staging clones, contract
 * testing, or when Mudad rotates the gateway.
 */

export type MudadEnvironment = "sandbox" | "production";

export function mudadBaseUrl(env: MudadEnvironment): string {
  const fromEnv =
    env === "production"
      ? process.env.MUDAD_PROD_URL
      : process.env.MUDAD_SANDBOX_URL;
  if (fromEnv && fromEnv.length > 0) return stripTrailingSlash(fromEnv);

  // Spec defaults — same host for both, environment-scoped via the
  // OAuth client credentials issued at onboarding.
  if (env === "production") return "https://api.mudad.com.sa";
  return "https://api-sandbox.mudad.com.sa";
}

/** Path suffix for the OAuth2 token endpoint. */
export const MUDAD_TOKEN_PATH = "/oauth2/token";

/** Path suffix for salary settlement submission. */
export const MUDAD_SALARY_PATH = "/v1/payroll/salary";

/** Path suffix for unpaid-leave registration. */
export const MUDAD_LEAVE_UNPAID_PATH = "/v1/leave/unpaid";

/** Path suffix for exit/re-entry registration. */
export const MUDAD_EXIT_REENTRY_PATH = "/v1/movement/exit-reentry";

/** Path suffix for contract termination submission. */
export const MUDAD_TERMINATION_PATH = "/v1/contract/termination";

/** Path suffix for new contract registration (used on hire). */
export const MUDAD_CONTRACT_REGISTER_PATH = "/v1/contract/register";

/** Path suffix for status enquiry by Mudad ref id. */
export const MUDAD_STATUS_PATH = "/v1/status";

/** Pure URL joiner — same shape as ZATCA's buildFatoraUrl. */
export function buildMudadUrl(env: MudadEnvironment, path: string): string {
  const base = mudadBaseUrl(env);
  return `${base}${path.startsWith("/") ? path : "/" + path}`;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
