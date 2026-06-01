// N17 — Nusk live API client.
//
// Closes N17 from CRITICAL_DEFECTS_REPORT.md. Pre-fix, Nusk integration
// was import-only — operator downloaded voucher CSVs and uploaded
// them. This client wraps the Nusk Umrah Service Provider API
// (Saudi Ministry of Hajj and Umrah's portal at
// https://nusuk.sa) for live pilgrim sync, voucher push, and
// reservation status polling.
//
// Authentication: API key in the `X-Nusk-API-Key` header. Operators
// receive a key after registering as a service provider.
//
// Configuration:
//   NUSK_API_BASE   = https://api.nusuk.sa  (or sandbox host)
//   NUSK_API_KEY    = <ministry-issued>
//   NUSK_AGENT_ID   = <ministry-issued operator id>
//
// All three can be overridden per-tenant via integrations.config.

import { logger } from "../logger.js";
import { config } from "../config.js";

export interface NuskPilgrimPayload {
  passportNumber: string;
  fullName: string;
  nationalityCode: string;
  birthDate: string;
  gender: "M" | "F";
  visaNumber?: string;
  groupId?: string;
}

export interface NuskVoucherPayload {
  agentVoucherRef: string;
  pilgrimPassports: string[];
  serviceType: "transport" | "accommodation" | "meals" | "all";
  packageRef: string;
  amount: number;
  currency?: string;
}

export interface NuskResponse<T = unknown> {
  ok: boolean;
  status: string;
  data?: T;
  nuskRef?: string;
  errorMessage?: string;
}

interface NuskConfig {
  baseUrl: string;
  apiKey: string;
  agentId: string;
}

class NuskConfigError extends Error {
  status = 503;
  code = "NUSK_NOT_CONFIGURED";
}

function loadConfig(perTenant?: Partial<NuskConfig>): NuskConfig {
  const baseUrl = perTenant?.baseUrl || config.nusk.apiBase;
  const apiKey = perTenant?.apiKey || config.nusk.apiKey;
  const agentId = perTenant?.agentId || config.nusk.agentId;

  if (config.nusk.testMode) {
    return { baseUrl: "mock://nusk", apiKey: "test", agentId: "test-agent" };
  }
  if (!baseUrl || !apiKey || !agentId) {
    throw new NuskConfigError(
      "Nusk integration not configured. Set NUSK_API_BASE + NUSK_API_KEY + NUSK_AGENT_ID."
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, agentId };
}

async function nuskFetch(cfg: NuskConfig, path: string, init?: RequestInit): Promise<{ resp: Response; body: string }> {
  const resp = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-Nusk-API-Key": cfg.apiKey,
      "X-Nusk-Agent-Id": cfg.agentId,
      "Accept": "application/json",
      "Accept-Language": "ar",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await resp.text();
  return { resp, body };
}

/** Register a pilgrim with Nusk. Returns the Nusk-issued reference. */
export async function registerPilgrimWithNusk(
  payload: NuskPilgrimPayload,
  perTenantConfig?: Partial<NuskConfig>,
): Promise<NuskResponse<{ nuskNumber: string }>> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://nusk") {
    const fake = `NSK-${Date.now().toString(36).toUpperCase()}`;
    return { ok: true, status: "registered", nuskRef: fake, data: { nuskNumber: fake } };
  }

  try {
    const { resp, body } = await nuskFetch(cfg, "/v1/pilgrims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let json: any = null;
    try { json = JSON.parse(body); } catch { /* ignore */ }
    if (!resp.ok) {
      logger.warn({ status: resp.status, body }, "[nusk] pilgrim register rejected");
      return { ok: false, status: "rejected", errorMessage: json?.error ?? body.slice(0, 500) };
    }
    return {
      ok: true,
      status: json?.status ?? "registered",
      nuskRef: json?.nusk_number ?? json?.nuskNumber,
      data: json,
    };
  } catch (err) {
    logger.error({ err }, "[nusk] pilgrim register network error");
    return { ok: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

/** Push a voucher to Nusk for service confirmation. */
export async function pushVoucherToNusk(
  payload: NuskVoucherPayload,
  perTenantConfig?: Partial<NuskConfig>,
): Promise<NuskResponse<{ nuskVoucherRef: string }>> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://nusk") {
    const fake = `NSK-V-${Date.now().toString(36).toUpperCase()}`;
    return { ok: true, status: "confirmed", nuskRef: fake, data: { nuskVoucherRef: fake } };
  }

  try {
    const { resp, body } = await nuskFetch(cfg, "/v1/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_voucher_ref: payload.agentVoucherRef,
        pilgrim_passports: payload.pilgrimPassports,
        service_type: payload.serviceType,
        package_ref: payload.packageRef,
        amount: payload.amount,
        currency: payload.currency ?? "SAR",
      }),
    });
    let json: any = null;
    try { json = JSON.parse(body); } catch { /* ignore */ }
    if (!resp.ok) {
      return { ok: false, status: "rejected", errorMessage: json?.error ?? body.slice(0, 500) };
    }
    return {
      ok: true,
      status: json?.status ?? "confirmed",
      nuskRef: json?.nusk_voucher_ref ?? json?.nuskVoucherRef,
      data: json,
    };
  } catch (err) {
    logger.error({ err }, "[nusk] voucher push network error");
    return { ok: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

/** Poll a reservation/voucher status from Nusk. */
export async function fetchNuskStatus(
  nuskRef: string,
  perTenantConfig?: Partial<NuskConfig>,
): Promise<NuskResponse> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://nusk") {
    return { ok: true, status: "confirmed", nuskRef, data: { mock: true } };
  }
  const { resp, body } = await nuskFetch(cfg, `/v1/lookup/${encodeURIComponent(nuskRef)}`);
  if (resp.status === 404) return { ok: false, status: "not_found", nuskRef };
  if (!resp.ok) return { ok: false, status: "error", errorMessage: `HTTP ${resp.status}` };
  let json: any = null;
  try { json = JSON.parse(body); } catch { /* ignore */ }
  return {
    ok: true,
    status: json?.status ?? "unknown",
    nuskRef,
    data: json,
  };
}
