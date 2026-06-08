// Account code numbering for the chart of accounts (#1715, Comment #6).
//
// Ghayth's COA is a fixed-width numeric hierarchy (Saudi SOCPA style):
//   level 1  X000   (e.g. 1000 assets)
//   level 2  XY00   (e.g. 1100 current assets)
//   level 3  XYZ0   (e.g. 1110 cash on hand)
//   level 4  XYZW   (e.g. 1111 main cash box)
//
// A parent at `level` owns the digit at position `level+1` (1-based from the
// left), so the increment between its children is:
//   step = 10 ^ (codeWidth - 1 - parentLevel)
// giving 100 → 10 → 1 as you descend a 4-digit tree, and 1000 between roots.
//
// These helpers are PURE (no DB) so they unit-test cleanly; the route in
// finance-accounts.ts feeds them the company's existing codes.

export interface NextCodeResult {
  code: string | null;
  reason?: string;
}

/** Most common length among the numeric codes; defaults to 4. */
export function inferCodeWidth(codes: string[]): number {
  const freq = new Map<number, number>();
  for (const c of codes) {
    if (/^\d+$/.test(c)) freq.set(c.length, (freq.get(c.length) ?? 0) + 1);
  }
  if (freq.size === 0) return 4;
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * Suggest the next free child code under `parentCode`. Returns the first free
 * slot at or after max(existing child)+step, staying inside the parent's block
 * so it never collides with a sibling parent's range.
 */
export function suggestNextChildCode(opts: {
  parentCode: string;
  parentLevel: number;
  codeWidth: number;
  childCodes: string[];
  allCodes: Set<string>;
}): NextCodeResult {
  const { parentCode, parentLevel, codeWidth: W, childCodes, allCodes } = opts;
  if (!/^\d+$/.test(parentCode)) {
    return { code: null, reason: "رمز الحساب الأب غير رقمي — أدخل الرمز يدوياً" };
  }
  const stepExp = W - 1 - parentLevel;
  if (stepExp < 0) {
    return { code: null, reason: "الحساب الأب في أعمق مستوى — لا يمكن اشتقاق رمز فرعي تلقائياً" };
  }
  const step = Math.pow(10, stepExp);
  const base = Number(parentCode);
  const blockEnd = base + 10 * step; // exclusive — start of the next sibling block
  const childNums = childCodes
    .filter((c) => /^\d+$/.test(c))
    .map(Number)
    .filter((n) => n > base && n < blockEnd);
  let candidate = (childNums.length ? Math.max(...childNums) : base) + step;
  while (candidate < blockEnd && allCodes.has(String(candidate).padStart(W, "0"))) {
    candidate += step;
  }
  if (candidate >= blockEnd) {
    return { code: null, reason: "نفدت الأرقام الفرعية المتاحة تحت هذا الحساب الأب" };
  }
  return { code: String(candidate).padStart(W, "0") };
}

const TYPE_FIRST_DIGIT: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  revenue: 4,
  expense: 5,
};

/**
 * Suggest the next free root code. With `type`, returns that family's X000 if
 * free; otherwise the next unused leading digit.
 */
export function suggestNextRootCode(opts: {
  codeWidth: number;
  rootCodes: string[];
  allCodes: Set<string>;
  type?: string | null;
}): NextCodeResult {
  const W = opts.codeWidth;
  const step = Math.pow(10, W - 1); // 1000 for width 4
  const typeDigit = opts.type ? TYPE_FIRST_DIGIT[opts.type] : undefined;
  if (typeDigit) {
    const code = String(typeDigit * step).padStart(W, "0");
    return opts.allCodes.has(code)
      ? { code: null, reason: "الجذر الرئيسي لهذا النوع موجود مسبقاً — اختر حساباً أب" }
      : { code };
  }
  const usedFirst = new Set(
    opts.rootCodes.filter((c) => /^\d+$/.test(c)).map((c) => Math.floor(Number(c) / step)),
  );
  let d = 1;
  while (d < 10 && usedFirst.has(d)) d++;
  if (d >= 10) return { code: null, reason: "نفدت الجذور الرئيسية المتاحة" };
  return { code: String(d * step).padStart(W, "0") };
}
