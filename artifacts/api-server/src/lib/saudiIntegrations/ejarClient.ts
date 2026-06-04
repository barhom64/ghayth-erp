// N15 — Ejar API client.
//
// Closes N15 from CRITICAL_DEFECTS_REPORT.md. Pre-fix, the system
// stored ejarNumber/ejarStatus as fields-only — no live submission to
// the Ejar platform. This client wraps the Ejar Open Banking / Ejar
// platform REST API documented at https://www.ejar.sa (registered
// real-estate operators access the developer portal there).
//
// Authentication: OAuth2 client-credentials. Operator registers their
// company with Ejar and receives clientId + clientSecret + the API
// base URL appropriate for sandbox vs production.
//
// Configuration:
//   EJAR_API_BASE       = https://api.ejar.sa  (or sandbox host)
//   EJAR_CLIENT_ID      = <issued by Ejar>
//   EJAR_CLIENT_SECRET  = <issued by Ejar>
//   EJAR_LANDLORD_NID   = <national id of the legal landlord>
//
// All four can also be overridden per-tenant via the
// integrations.config table (key 'ejar'). Per-tenant takes precedence.

import { logger } from "../logger.js";
import { config } from "../config.js";

export interface EjarContractPayload {
  ejarNumber?: string;
  unitId?: string;
  tenantNationalId: string;
  tenantName: string;
  landlordNationalId: string;
  startDate: string;
  endDate: string;
  annualRent: number;
  paymentSchedule: "monthly" | "quarterly" | "semi_annual" | "annual";
  contractType: "residential" | "commercial";
}

export interface EjarResponse<T = unknown> {
  ok: boolean;
  ejarNumber?: string;
  status: string;
  data?: T;
  errorMessage?: string;
}

interface EjarTokenCache { token: string; expiresAt: number }

class EjarConfigError extends Error {
  status = 503;
  code = "EJAR_NOT_CONFIGURED";
}

interface EjarConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  landlordNid?: string;
}

function loadConfig(perTenant?: Partial<EjarConfig>): EjarConfig {
  const baseUrl = perTenant?.baseUrl || config.ejar.apiBase;
  const clientId = perTenant?.clientId || config.ejar.clientId;
  const clientSecret = perTenant?.clientSecret || config.ejar.clientSecret;
  const landlordNid = perTenant?.landlordNid || config.ejar.landlordNid;

  if (config.ejar.testMode) {
    return { baseUrl: "mock://ejar", clientId: "test", clientSecret: "test", landlordNid };
  }
  if (!baseUrl || !clientId || !clientSecret) {
    throw new EjarConfigError(
      "Ejar integration not configured. Set EJAR_API_BASE + EJAR_CLIENT_ID + EJAR_CLIENT_SECRET (env or per-tenant integrations.config.ejar)."
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), clientId, clientSecret, landlordNid };
}

const tokenCache = new Map<string, EjarTokenCache>();

async function getAccessToken(cfg: EjarConfig): Promise<string> {
  if (cfg.baseUrl === "mock://ejar") return "mock-token";
  const cacheKey = `${cfg.clientId}@${cfg.baseUrl}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "ejar.contracts.write ejar.contracts.read",
  });
  const resp = await fetch(`${cfg.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`ejar token endpoint returned HTTP ${resp.status}`);
  const json = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("ejar token endpoint did not return access_token");
  const ttl = (json.expires_in ?? 3600) * 1000;
  const entry = { token: json.access_token, expiresAt: Date.now() + ttl - 30_000 };
  tokenCache.set(cacheKey, entry);
  return entry.token;
}

/** Submit a new rental contract to Ejar for registration. */
export async function submitContractToEjar(
  payload: EjarContractPayload,
  perTenantConfig?: Partial<EjarConfig>,
): Promise<EjarResponse<{ ejarNumber: string }>> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://ejar") {
    const fake = `EJAR-${Date.now().toString(36).toUpperCase()}`;
    return { ok: true, status: "registered", ejarNumber: fake, data: { ejarNumber: fake } };
  }
  const token = await getAccessToken(cfg);
  try {
    const resp = await fetch(`${cfg.baseUrl}/contracts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept-Language": "ar",
      },
      body: JSON.stringify({
        landlord: { nationalId: payload.landlordNationalId || cfg.landlordNid },
        tenant: { nationalId: payload.tenantNationalId, name: payload.tenantName },
        unit: { externalId: payload.unitId },
        contract: {
          startDate: payload.startDate,
          endDate: payload.endDate,
          annualRent: payload.annualRent,
          paymentSchedule: payload.paymentSchedule,
          contractType: payload.contractType,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!resp.ok) {
      logger.warn({ status: resp.status, body: text }, "[ejar] contract submission rejected");
      return { ok: false, status: "rejected", errorMessage: json?.error ?? text.slice(0, 500) };
    }
    return {
      ok: true,
      status: json?.status ?? "submitted",
      ejarNumber: json?.ejarNumber ?? json?.contractNumber,
      data: json,
    };
  } catch (err) {
    logger.error({ err }, "[ejar] contract submission network error");
    return { ok: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

/** Poll status for a previously-submitted contract. */
export async function fetchContractStatus(
  ejarNumber: string,
  perTenantConfig?: Partial<EjarConfig>,
): Promise<EjarResponse> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://ejar") {
    return { ok: true, status: "registered", ejarNumber, data: { mock: true } };
  }
  const token = await getAccessToken(cfg);
  const resp = await fetch(`${cfg.baseUrl}/contracts/${encodeURIComponent(ejarNumber)}`, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": "ar" },
    signal: AbortSignal.timeout(15_000),
  });
  if (resp.status === 404) return { ok: false, status: "not_found", ejarNumber };
  if (!resp.ok) return { ok: false, status: "error", errorMessage: `HTTP ${resp.status}` };
  const json = await resp.json();
  return { ok: true, status: (json as { status?: string }).status ?? "unknown", ejarNumber, data: json };
}
