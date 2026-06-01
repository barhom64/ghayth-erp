// N16 — Sadad payment client.
//
// Closes N16 from CRITICAL_DEFECTS_REPORT.md. Sadad is the SAMA-
// regulated bill-payment system used across Saudi banks; this client
// wraps the Sadad merchant API for creating bill references and
// validating incoming payment webhooks.
//
// Architecture:
//   - Merchant registers with their bank → receives biller_code +
//     api credentials + webhook secret.
//   - Merchant POSTs new bills to Sadad's gateway: {biller_code,
//     amount, ref_id, due_date, account_no}.
//   - Customer pays via their bank's app using the bill reference.
//   - Sadad pushes a webhook to the merchant's notification URL with
//     the payment confirmation, signed with the shared secret.
//
// Auth: HTTP Basic with merchant_id:api_key.
//
// Configuration:
//   SADAD_API_BASE       = https://sadad.api.sa  (or sandbox host)
//   SADAD_MERCHANT_ID    = <bank-issued>
//   SADAD_API_KEY        = <bank-issued>
//   SADAD_BILLER_CODE    = <bank-issued>
//   SADAD_WEBHOOK_SECRET = <merchant-set HMAC secret>

import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../logger.js";
import { config } from "../config.js";

export interface SadadBillPayload {
  refId: string;
  amount: number;
  dueDate: string;
  accountNo: string;
  customerName?: string;
  description?: string;
}

export interface SadadBillResponse {
  ok: boolean;
  billNumber?: string;
  status: string;
  errorMessage?: string;
}

interface SadadConfig {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  billerCode: string;
  webhookSecret: string;
}

class SadadConfigError extends Error {
  status = 503;
  code = "SADAD_NOT_CONFIGURED";
}

function loadConfig(perTenant?: Partial<SadadConfig>): SadadConfig {
  const baseUrl = perTenant?.baseUrl || config.sadad.apiBase;
  const merchantId = perTenant?.merchantId || config.sadad.merchantId;
  const apiKey = perTenant?.apiKey || config.sadad.apiKey;
  const billerCode = perTenant?.billerCode || config.sadad.billerCode;
  const webhookSecret = perTenant?.webhookSecret || config.sadad.webhookSecret;

  if (config.sadad.testMode) {
    return {
      baseUrl: "mock://sadad",
      merchantId: "test",
      apiKey: "test",
      billerCode: "0000",
      webhookSecret: "test-webhook-secret",
    };
  }
  if (!baseUrl || !merchantId || !apiKey || !billerCode || !webhookSecret) {
    throw new SadadConfigError(
      "Sadad integration not configured. Set SADAD_API_BASE + SADAD_MERCHANT_ID + SADAD_API_KEY + SADAD_BILLER_CODE + SADAD_WEBHOOK_SECRET."
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    merchantId,
    apiKey,
    billerCode,
    webhookSecret,
  };
}

/** Create a Sadad bill. Returns the bill number the customer types
 *  into their bank app. */
export async function createSadadBill(
  payload: SadadBillPayload,
  perTenantConfig?: Partial<SadadConfig>,
): Promise<SadadBillResponse> {
  const cfg = loadConfig(perTenantConfig);
  if (cfg.baseUrl === "mock://sadad") {
    const fake = `${cfg.billerCode}${Date.now().toString().slice(-10)}`;
    return { ok: true, billNumber: fake, status: "active" };
  }

  const auth = Buffer.from(`${cfg.merchantId}:${cfg.apiKey}`).toString("base64");
  try {
    const resp = await fetch(`${cfg.baseUrl}/bills`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        biller_code: cfg.billerCode,
        ref_id: payload.refId,
        amount: payload.amount,
        due_date: payload.dueDate,
        account_no: payload.accountNo,
        customer_name: payload.customerName,
        description: payload.description,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!resp.ok) {
      logger.warn({ status: resp.status, body: text }, "[sadad] bill create rejected");
      return { ok: false, status: "rejected", errorMessage: json?.error ?? text.slice(0, 500) };
    }
    return {
      ok: true,
      billNumber: json?.bill_number ?? json?.billNumber,
      status: json?.status ?? "active",
    };
  } catch (err) {
    logger.error({ err }, "[sadad] bill create network error");
    return { ok: false, status: "error", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

/** Verify a Sadad webhook signature.
 *  Expected header: `X-Sadad-Signature: sha256=<hex>` over the raw body. */
export function verifySadadWebhook(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  perTenantConfig?: Partial<SadadConfig>,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  let cfg: SadadConfig;
  try { cfg = loadConfig(perTenantConfig); } catch { return false; }
  const provided = signatureHeader.slice("sha256=".length);
  const raw = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const expected = createHmac("sha256", cfg.webhookSecret).update(raw).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch { return false; }
}

/** Parse a verified Sadad webhook payload into a structured event. */
export interface SadadWebhookEvent {
  type: "payment.received" | "payment.reversed" | string;
  billNumber: string;
  refId: string;
  amountPaid: number;
  paidAt: string;
  paymentChannel: string;
  raw: unknown;
}

export function parseSadadWebhook(rawBody: unknown): SadadWebhookEvent | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const r = rawBody as Record<string, unknown>;
  const type = String(r.event_type ?? r.type ?? "");
  const billNumber = String(r.bill_number ?? r.billNumber ?? "");
  const refId = String(r.ref_id ?? r.refId ?? "");
  if (!type || !billNumber) return null;
  return {
    type,
    billNumber,
    refId,
    amountPaid: Number(r.amount_paid ?? r.amount ?? 0),
    paidAt: String(r.paid_at ?? r.timestamp ?? new Date().toISOString()),
    paymentChannel: String(r.channel ?? r.bank ?? ""),
    raw: rawBody,
  };
}
