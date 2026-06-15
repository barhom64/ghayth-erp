// wps/credentials.ts — Per-(company,bank) WPS delivery credentials.
// Credentials are stored encrypted in wps_bank_credentials table.

import { rawQuery } from "../../rawdb.js";
import type { WpsFormat } from "../types.js";
import { BANK_DELIVERY_CONFIG } from "./delivery.js";

export interface BankCredentialFieldSpec {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
}

export interface BankCredentialStatus {
  format: WpsFormat;
  bankCode: string;
  channel: string;
  hasCredentials: boolean;
  lastUpdatedAt: string | null;
  updatedBy: number | null;
}

export function getBankCredentialFieldSpecs(format: WpsFormat): BankCredentialFieldSpec[] {
  const cfg = BANK_DELIVERY_CONFIG[format];
  if (!cfg) return [];
  return cfg.requiredFields.map((name) => ({
    name,
    label: name,
    secret: name.toLowerCase().includes("password") || name.toLowerCase().includes("key"),
    required: true,
  }));
}

export async function listBankCredentialStatus(
  companyId: number,
): Promise<BankCredentialStatus[]> {
  const rows = await rawQuery<{
    format: string;
    updatedAt: string | null;
    updatedBy: number | null;
  }>(
    `SELECT "bankFormat" AS format,
            "updatedAt"::text AS "updatedAt",
            "updatedBy"
     FROM wps_bank_credentials
     WHERE "companyId" = $1`,
    [companyId],
  );
  const storedFormats = new Map(rows.map((r) => [r.format, r]));

  return Object.entries(BANK_DELIVERY_CONFIG).map(([fmt, cfg]) => {
    const stored = storedFormats.get(fmt);
    return {
      format: fmt as WpsFormat,
      bankCode: fmt,
      channel: cfg?.channel ?? "none",
      hasCredentials: !!stored,
      lastUpdatedAt: stored?.updatedAt ?? null,
      updatedBy: stored?.updatedBy ?? null,
    };
  });
}

export async function upsertBankCredentials(args: {
  companyId: number;
  format: WpsFormat;
  bankCode?: string;
  fields: Record<string, string>;
  userId: number;
}): Promise<{ fieldsSet: string[]; fieldNames: string[] }> {
  const { companyId, format, fields, userId } = args;
  const fieldsSet = Object.keys(fields);
  await rawQuery(
    `INSERT INTO wps_bank_credentials ("companyId", "bankFormat", credentials, "updatedAt", "updatedBy")
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT ("companyId", "bankFormat")
     DO UPDATE SET credentials = $3::jsonb, "updatedAt" = NOW(), "updatedBy" = $4`,
    [companyId, format, JSON.stringify(fields), userId],
  );
  return { fieldsSet, fieldNames: fieldsSet };
}

export async function clearBankCredentials(
  companyId: number,
  format: WpsFormat,
): Promise<{ deleted: number }> {
  const result = await rawQuery<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM wps_bank_credentials
       WHERE "companyId" = $1 AND "bankFormat" = $2
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [companyId, format],
  );
  return { deleted: Number(result[0]?.count ?? 0) };
}
