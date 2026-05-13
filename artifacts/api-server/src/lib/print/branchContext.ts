/**
 * branchContext — fetches the letterhead metadata for a branch (or falls back
 * to company-level data) so the print engine has everything it needs to draw
 * a header and footer for any template.
 */

import { rawQuery } from "../rawdb.js";
import type { BranchLetterhead } from "./types.js";

interface BranchRow {
  id: number;
  name: string;
  nameEn: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  crNumber: string | null;
  logoUrl: string | null;
  footerText: string | null;
}

interface CompanyRow {
  id: number;
  name: string;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  crNumber: string | null;
  logoUrl: string | null;
}

export async function loadCompany(companyId: number) {
  const rows = await rawQuery<CompanyRow>(
    `SELECT id, name, "nameEn", address, phone, email, "taxNumber", "crNumber", "logoUrl"
     FROM companies WHERE id = $1 LIMIT 1`,
    [companyId]
  );
  return rows[0] ?? null;
}

export async function loadBranch(branchId: number | null) {
  if (!branchId) return null;
  const rows = await rawQuery<BranchRow>(
    `SELECT id, name, "nameEn", address, city, phone, email, website,
            "taxNumber", "crNumber", "logoUrl", "footerText"
     FROM branches WHERE id = $1 LIMIT 1`,
    [branchId]
  );
  return rows[0] ?? null;
}

export async function buildLetterhead(
  companyId: number,
  branchId: number | null
): Promise<{ branch: BranchLetterhead; companyRow: CompanyRow | null }> {
  const [company, branch] = await Promise.all([
    loadCompany(companyId),
    loadBranch(branchId),
  ]);
  const letterhead: BranchLetterhead = {
    companyName: company?.name ?? "",
    branchName: branch?.name ?? company?.name ?? "",
    branchNameEn: branch?.nameEn ?? company?.nameEn ?? undefined,
    address: branch?.address ?? company?.address ?? undefined,
    city: branch?.city ?? undefined,
    phone: branch?.phone ?? company?.phone ?? undefined,
    email: branch?.email ?? company?.email ?? undefined,
    website: branch?.website ?? undefined,
    taxNumber: branch?.taxNumber ?? company?.taxNumber ?? undefined,
    crNumber: branch?.crNumber ?? company?.crNumber ?? undefined,
    logoUrl: branch?.logoUrl ?? company?.logoUrl ?? undefined,
    footerText: branch?.footerText ?? undefined,
  };
  return { branch: letterhead, companyRow: company };
}
