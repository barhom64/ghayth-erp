/**
 * Thin HTTP wrapper around the Mudad API.
 *
 * Same shape as the ZATCA Fatoora client (see
 * artifacts/api-server/src/lib/zatca/client.ts): leaf functions per
 * endpoint, a structured transport-error class, and dependency-
 * injectable token + fetch hooks so the unit tests don't need the
 * network.
 *
 * Idempotency: Mudad assigns a unique mudadRefId on the first
 * accepted submission. Re-submitting the same payload returns the
 * existing ref (the server-side dedup is keyed on companyId +
 * employeeId + period + type). The route handler stores the ref in
 * `mudad_settlements` so retries are safe.
 */
import {
  buildMudadUrl,
  MUDAD_SALARY_PATH,
  MUDAD_LEAVE_UNPAID_PATH,
  MUDAD_EXIT_REENTRY_PATH,
  MUDAD_TERMINATION_PATH,
  MUDAD_STATUS_PATH,
  type MudadEnvironment,
} from "./endpoints.js";
import { bearerHeader, getMudadAccessToken, type MudadCredentials } from "./auth.js";
import { config } from "../../config.js";

const DEFAULT_TIMEOUT_MS = config.mudad.requestTimeoutMs;

export interface SalarySubmission {
  /** YYYY-MM. */
  period: string;
  employeeId: number;
  iqamaOrId: string;
  iban: string;
  amount: number;
  basicSalary: number;
  housingAllowance: number;
  otherAllowances: number;
  deductions: number;
}

export interface LeaveUnpaidSubmission {
  employeeId: number;
  iqamaOrId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface TerminationSubmission {
  employeeId: number;
  iqamaOrId: string;
  terminationDate: string;
  /** From a closed enum the ministry publishes — we forward whatever
   *  the operator picked in the UI. */
  reasonCode: string;
  endOfServiceAmount?: number;
}

export interface MudadResponse {
  /** Mudad-issued reference id; absent on rejected submissions. */
  refId: string | null;
  /** The ministry's lifecycle status for the row. */
  status: "submitted" | "acknowledged" | "rejected" | "pending";
  /** Validation messages — operator-facing. */
  errors: string[];
  warnings: string[];
  /** Echo of the parsed body so the audit log captures what
   *  Mudad returned. */
  rawResponse: unknown;
}

/**
 * Structured transport-level error. The route handler decides whether
 * to surface to the operator (4xx) or push onto a retry queue (5xx /
 * timeout) based on the httpStatus.
 */
export class MudadTransportError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "MudadTransportError";
  }
}

export interface MudadClientCallOpts {
  env: MudadEnvironment;
  companyId: number;
  creds: MudadCredentials;
  /** Optional cancel signal so the operator can cancel a long
   *  request. */
  signal?: AbortSignal;
}

/** Submit a salary settlement for a single employee. */
export async function submitSalary(
  opts: MudadClientCallOpts & { submission: SalarySubmission },
): Promise<MudadResponse> {
  return postMudad(opts, MUDAD_SALARY_PATH, opts.submission);
}

/** Register an unpaid-leave period. */
export async function submitLeaveUnpaid(
  opts: MudadClientCallOpts & { submission: LeaveUnpaidSubmission },
): Promise<MudadResponse> {
  return postMudad(opts, MUDAD_LEAVE_UNPAID_PATH, opts.submission);
}

/** Register an exit/re-entry movement (departure abroad). */
export async function submitExitReentry(
  opts: MudadClientCallOpts & {
    submission: { employeeId: number; iqamaOrId: string; startDate: string; expectedReturn: string };
  },
): Promise<MudadResponse> {
  return postMudad(opts, MUDAD_EXIT_REENTRY_PATH, opts.submission);
}

/** Submit a contract termination notice. */
export async function submitTermination(
  opts: MudadClientCallOpts & { submission: TerminationSubmission },
): Promise<MudadResponse> {
  return postMudad(opts, MUDAD_TERMINATION_PATH, opts.submission);
}

/** Look up the lifecycle status of a previously-submitted row. */
export async function fetchStatus(
  opts: MudadClientCallOpts & { refId: string },
): Promise<MudadResponse> {
  const token = await getMudadAccessToken({
    companyId: opts.companyId,
    env: opts.env,
    creds: opts.creds,
  });
  const url = `${buildMudadUrl(opts.env, MUDAD_STATUS_PATH)}/${encodeURIComponent(opts.refId)}`;
  const json = await getJson(url, token, opts.signal);
  return parseMudadResponse(json);
}

// ─────────────────────────────────────────────────────────────────────
// Pure parser — separated for testability.
// ─────────────────────────────────────────────────────────────────────

interface RawMudadBody {
  refId?: string;
  ref_id?: string;
  status?: string;
  errors?: Array<{ code?: string; message?: string }>;
  warnings?: Array<{ code?: string; message?: string }>;
}

export function parseMudadResponse(body: RawMudadBody): MudadResponse {
  const refId = body.refId ?? body.ref_id ?? null;
  const status = mapStatus(body.status);
  const errors = (body.errors ?? []).map(formatMessage).filter(Boolean);
  const warnings = (body.warnings ?? []).map(formatMessage).filter(Boolean);
  return { refId, status, errors, warnings, rawResponse: body };
}

function mapStatus(raw: string | undefined): MudadResponse["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "submitted": return "submitted";
    case "acknowledged":
    case "accepted":
    case "ok":
      return "acknowledged";
    case "rejected":
    case "error":
      return "rejected";
    case "pending":
    case "queued":
      return "pending";
    default:
      // Unknown status surfaces as 'pending' with a diagnostic
      // warning rather than 'acknowledged' — same conservative
      // choice as the Fatoora response parser.
      return "pending";
  }
}

function formatMessage(m: { code?: string; message?: string }): string {
  const code = m.code ?? "—";
  const msg = m.message ?? "(no message)";
  return `[${code}] ${msg}`;
}

// ─────────────────────────────────────────────────────────────────────
// Internal HTTP helpers
// ─────────────────────────────────────────────────────────────────────

async function postMudad(
  opts: MudadClientCallOpts,
  path: string,
  body: unknown,
): Promise<MudadResponse> {
  const token = await getMudadAccessToken({
    companyId: opts.companyId,
    env: opts.env,
    creds: opts.creds,
  });
  const url = buildMudadUrl(opts.env, path);
  const json = await postJson(url, JSON.stringify(body), token, opts.signal);
  return parseMudadResponse(json);
}

async function postJson(
  url: string,
  body: string,
  token: string,
  externalSignal?: AbortSignal,
): Promise<RawMudadBody> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`Mudad request timed out after ${DEFAULT_TIMEOUT_MS}ms`)),
    DEFAULT_TIMEOUT_MS,
  );
  externalSignal?.addEventListener("abort", () => controller.abort(externalSignal.reason));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: bearerHeader(token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
    });
    return decodeResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getJson(url: string, token: string, externalSignal?: AbortSignal): Promise<RawMudadBody> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`Mudad request timed out after ${DEFAULT_TIMEOUT_MS}ms`)),
    DEFAULT_TIMEOUT_MS,
  );
  externalSignal?.addEventListener("abort", () => controller.abort(externalSignal.reason));

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: bearerHeader(token),
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    return decodeResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function decodeResponse(response: Response): Promise<RawMudadBody> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new MudadTransportError(
      `Mudad returned non-JSON response (${response.status})`,
      response.status,
      text.slice(0, 2000),
    );
  }
  if (!response.ok) {
    throw new MudadTransportError(
      `Mudad returned HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }
  return parsed as RawMudadBody;
}
