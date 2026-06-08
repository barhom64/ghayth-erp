import { z } from "zod";
import { ValidationError } from "./errorHandler.js";

// #1715 — multi cost-center distribution. A single expense can be spread
// across several cost centers, either by percentage (must total 100) or by
// explicit amount (must total the expense base). Each split becomes its own
// DR leg on the JE so cost-by-center reports are exact. Kept in its own
// DB-free module so the proration math is unit-testable in isolation.
export const costCenterSplitSchema = z.object({
  costCenterId: z.coerce.number().int().positive(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  amount: z.coerce.number().min(0).optional(),
});
export type CostCenterSplit = z.infer<typeof costCenterSplitSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Resolve a distribution into concrete { costCenterId, amount } legs that sum
// EXACTLY to `total`. Percentage and amount modes are mutually exclusive. The
// rounding remainder is absorbed by the last leg so the JE stays balanced —
// never trust floating proration to land on the cent. Pure + side-effect free.
export function resolveCostCenterSplits(
  dist: CostCenterSplit[],
  total: number
): { costCenterId: number; amount: number }[] {
  const hasAmount = dist.some((d) => d.amount != null);
  const hasPct = dist.some((d) => d.percentage != null);
  if (hasAmount && hasPct) {
    throw new ValidationError("لا يمكن خلط النسب والمبالغ في توزيع مراكز التكلفة — استخدم أحدهما", { field: "costCenterDistribution" });
  }
  if (!hasAmount && !hasPct) {
    throw new ValidationError("كل سطر في توزيع مراكز التكلفة يحتاج نسبة أو مبلغ", { field: "costCenterDistribution" });
  }
  const legs = dist.map((d) => ({
    costCenterId: d.costCenterId,
    amount: hasAmount ? round2(Number(d.amount ?? 0)) : round2((total * Number(d.percentage ?? 0)) / 100),
  }));
  if (hasPct) {
    const pctSum = dist.reduce((s, d) => s + Number(d.percentage ?? 0), 0);
    if (Math.abs(pctSum - 100) > 0.01) {
      throw new ValidationError(`مجموع نسب توزيع مراكز التكلفة يجب أن يساوي 100% (الحالي ${round2(pctSum)}%)`, { field: "costCenterDistribution" });
    }
  } else {
    const amtSum = round2(legs.reduce((s, l) => s + l.amount, 0));
    if (Math.abs(amtSum - round2(total)) > 0.01) {
      throw new ValidationError(`مجموع مبالغ توزيع مراكز التكلفة (${amtSum}) يجب أن يساوي قيمة المصروف (${round2(total)})`, { field: "costCenterDistribution" });
    }
  }
  // Absorb any rounding drift into the last leg so the legs sum to `total`.
  const allocated = round2(legs.reduce((s, l) => s + l.amount, 0));
  const drift = round2(total - allocated);
  if (drift !== 0 && legs.length > 0) {
    legs[legs.length - 1].amount = round2(legs[legs.length - 1].amount + drift);
  }
  return legs;
}
