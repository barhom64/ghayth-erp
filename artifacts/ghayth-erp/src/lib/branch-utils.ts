import type { BranchLetterhead } from "@/components/print-layout";

export function extractBranchFromResponse(data: any): BranchLetterhead | undefined {
  if (!data?.branchName) return undefined;
  return {
    name: data.branchName,
    nameEn: data.branchNameEn,
    logoUrl: data.branchLogoUrl,
    address: data.branchAddress,
    phone: data.branchPhone,
    email: data.branchEmail,
    website: data.branchWebsite,
    taxNumber: data.branchTaxNumber,
    crNumber: data.branchCrNumber,
    footerText: data.branchFooterText,
    city: data.branchCity,
  };
}
