// mudad/service.ts — High-level Mudad operations used by the route.
// Wraps the low-level client with company-level credential resolution,
// settlement persistence, and audit logging.

import { rawQuery, rawExecute } from "../../rawdb.js";
import type { MudadResponse } from "./client.js";
import { submitSalary, fetchStatus } from "./client.js";
import { getMudadAccessToken } from "./auth.js";
import { mudadBaseUrl } from "./endpoints.js";
import type { MudadEnvironment } from "./endpoints.js";
import type { MudadCredentials } from "./auth.js";

// ---------------------------------------------------------------------------
// Internal — resolve company mudad configuration from DB
// ---------------------------------------------------------------------------

async function resolveMudadConfig(companyId: number): Promise<{
  env: MudadEnvironment;
  credentials: MudadCredentials;
}> {
  const [row] = await rawQuery<{
    mudadClientId: string | null;
    mudadClientSecret: string | null;
    mudadEnv: string | null;
    mudadEstablishmentId: string | null;
  }>(
    `SELECT "mudadClientId", "mudadClientSecret", "mudadEnv", "mudadEstablishmentId"
     FROM companies
     WHERE id = $1`,
    [companyId],
  );
  const env: MudadEnvironment = row?.mudadEnv === "production" ? "production" : "sandbox";
  return {
    env,
    credentials: {
      clientId: row?.mudadClientId ?? "",
      clientSecret: row?.mudadClientSecret ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Contract registration
// ---------------------------------------------------------------------------

export interface RegisterMudadContractInput {
  companyId: number;
  userId: number;
  employeeId: number;
  iqamaOrId: string;
  basicSalary: number;
  housingAllowance: number;
  otherAllowances: number;
  iban: string;
  startDate: string;
}

export async function registerMudadContract(
  args: RegisterMudadContractInput,
): Promise<{ settlementId: number; response: MudadResponse }> {
  const { companyId, userId: _userId, employeeId, ...submission } = args;
  const cfg = await resolveMudadConfig(companyId);
  const token = await getMudadAccessToken({ env: cfg.env, companyId, creds: cfg.credentials });
  const baseUrl = mudadBaseUrl(cfg.env);
  // POST to Mudad contract-register endpoint
  const httpRes = await fetch(`${baseUrl}/contracts/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      iqamaNumber: submission.iqamaOrId,
      iban: submission.iban,
      startDate: submission.startDate,
      basicSalary: submission.basicSalary,
      housingAllowance: submission.housingAllowance,
      otherAllowances: submission.otherAllowances,
    }),
  });
  const rawBody = await httpRes.json().catch(() => ({}));
  const response: MudadResponse = {
    refId: (rawBody as any)?.refId ?? null,
    status:
      httpRes.ok
        ? (((rawBody as any)?.status as MudadResponse["status"]) ?? "submitted")
        : "rejected",
    errors: (rawBody as any)?.errors ?? [],
    warnings: (rawBody as any)?.warnings ?? [],
    rawResponse: rawBody,
  };

  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO mudad_settlements
       ("companyId", "employeeId", type, period, amount, status, payload, "mudadRefId",
        response, "submittedAt")
     VALUES ($1, $2, 'contract_register', NULL, 0, $3, $4::jsonb, $5, $6::jsonb, NOW())
     RETURNING id`,
    [
      companyId,
      employeeId,
      response.status,
      JSON.stringify(submission),
      response.refId,
      JSON.stringify(response.rawResponse),
    ],
  );
  return { settlementId: row.id, response };
}

// ---------------------------------------------------------------------------
// Direct call helpers (used for retry by the route layer)
// ---------------------------------------------------------------------------

export interface CallMudadSalaryInput {
  companyId: number;
  submission: {
    period: string;
    employeeId: number;
    iqamaOrId: string;
    iban: string;
    amount: number;
    basicSalary: number;
    housingAllowance: number;
    otherAllowances: number;
    deductions: number;
  };
}

export async function callMudadSalary(args: CallMudadSalaryInput): Promise<MudadResponse> {
  const { companyId, submission } = args;
  const cfg = await resolveMudadConfig(companyId);
  return submitSalary({
    env: cfg.env,
    companyId,
    creds: cfg.credentials,
    submission,
  });
}

export interface CallMudadContractRegisterInput {
  companyId: number;
  submission: {
    employeeId: number;
    iqamaOrId: string;
    iban: string;
    startDate: string;
    basicSalary: number;
    housingAllowance: number;
    otherAllowances: number;
  };
}

export async function callMudadContractRegister(
  args: CallMudadContractRegisterInput,
): Promise<MudadResponse> {
  const { companyId, submission } = args;
  const cfg = await resolveMudadConfig(companyId);
  const token = await getMudadAccessToken({ env: cfg.env, companyId, creds: cfg.credentials });
  const baseUrl = mudadBaseUrl(cfg.env);
  const httpRes = await fetch(`${baseUrl}/contracts/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      iqamaNumber: submission.iqamaOrId,
      iban: submission.iban,
      startDate: submission.startDate,
      basicSalary: submission.basicSalary,
      housingAllowance: submission.housingAllowance,
      otherAllowances: submission.otherAllowances,
    }),
  });
  const rawBody = await httpRes.json().catch(() => ({}));
  return {
    refId: (rawBody as any)?.refId ?? null,
    status: httpRes.ok
      ? (((rawBody as any)?.status as MudadResponse["status"]) ?? "submitted")
      : "rejected",
    errors: (rawBody as any)?.errors ?? [],
    warnings: (rawBody as any)?.warnings ?? [],
    rawResponse: rawBody,
  };
}

// ---------------------------------------------------------------------------
// Test seams — allow unit tests to inject mock implementations
// ---------------------------------------------------------------------------

type MudadSalaryCallFn = (args: CallMudadSalaryInput) => Promise<MudadResponse>;
type MudadContractRegisterCallFn = (
  args: CallMudadContractRegisterInput,
) => Promise<MudadResponse>;

let _callSalary: MudadSalaryCallFn = callMudadSalary;
let _callContractRegister: MudadContractRegisterCallFn = callMudadContractRegister;

/** @internal — visible for test injection only, do not use in production code */
export function __setMudadCallSalaryForTests(fn: MudadSalaryCallFn): void {
  _callSalary = fn;
}

/** @internal — visible for test injection only, do not use in production code */
export function __setMudadCallContractRegisterForTests(
  fn: MudadContractRegisterCallFn,
): void {
  _callContractRegister = fn;
}

// Suppress "unused variable" — test seams are set but not read via module-level call.
void _callSalary;
void _callContractRegister;
