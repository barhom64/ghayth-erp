import { useApiQuery } from "@/lib/api";
import type { BranchLetterhead } from "@/components/print-layout";

export function useBranchLetterhead(branchId?: number): BranchLetterhead | undefined {
  const { data: branches } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const list = branches?.data || [];
  if (branchId) return list.find((b: any) => b.id === branchId);
  return list[0];
}
