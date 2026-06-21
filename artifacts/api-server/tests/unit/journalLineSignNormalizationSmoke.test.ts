/**
 * دفاع المحرّك المركزي — تطبيع إشارة سطور القيد (معتمد: «التطبيع لا الرفض»).
 * assertion على سطور القيد بلا DB.
 *
 * `createJournalEntry` (المصدر الوحيد لكتابة سطور القيد: postJournalEntry و
 * createGuardedJournalEntry كلاهما يمرّ به) يستدعي normalizeJournalLineSigns قبل
 * التقريب والتوازن والكتابة. تدفقات داخلية (إقفال الفترة/التخلص من أصل/الاستقطاع)
 * كانت ترحّل debit/credit سالبًا عمدًا فتُشوَّه إجماليات المدين/الدائن. التطبيع
 * يحوّل السالب إلى العمود المقابل: الأثر المحاسبي مطابق، والتخزين يصبح قياسيًا.
 *
 * الثابت الحاكم: صافي كل سطر (debit − credit) لا يتغيّر ⇒ (Σdebit − Σcredit) ثابت
 * ⇒ بوابة عدم التوازن في createJournalEntry تبقى صحيحة (لا يكسر التطبيع شيئًا).
 */
import { describe, it, expect } from "vitest";
import { normalizeJournalLineSigns } from "../../src/lib/businessHelpers.js";

const net = (l: { debit: number; credit: number }) => l.debit - l.credit;
const sumNet = (ls: Array<{ debit: number; credit: number }>) => ls.reduce((s, l) => s + net(l), 0);

describe("normalizeJournalLineSigns — central engine sign defense", () => {
  it("negative debit becomes positive credit (same account movement)", () => {
    const line = { debit: -100, credit: 0 };
    normalizeJournalLineSigns([line]);
    expect(line).toEqual({ debit: 0, credit: 100 });
    expect(net(line)).toBe(-100); // movement unchanged
  });

  it("negative credit becomes positive debit (same account movement)", () => {
    const line = { debit: 0, credit: -50 };
    normalizeJournalLineSigns([line]);
    expect(line).toEqual({ debit: 50, credit: 0 });
    expect(net(line)).toBe(50);
  });

  it("positive lines pass through unchanged (no-op)", () => {
    const lines = [{ debit: 300, credit: 0 }, { debit: 0, credit: 300 }];
    normalizeJournalLineSigns(lines);
    expect(lines).toEqual([{ debit: 300, credit: 0 }, { debit: 0, credit: 300 }]);
  });

  it("period-close pattern (debit:-netIncome) posts the same balances after normalization", () => {
    // loss close: revenue/expense zeroed, retained earnings carries the loss as
    // a deliberate negative debit. After normalization the same movement lands
    // on the correct column and the entry stays balanced.
    const lines = [
      { debit: 0, credit: 1000, accountCode: "4101" },   // close revenue
      { debit: 1300, credit: 0, accountCode: "5101" },   // close expense (loss)
      { debit: -300, credit: 0, accountCode: "3201" },   // retained earnings: -loss
    ];
    const before = sumNet(lines);
    normalizeJournalLineSigns(lines);
    expect(lines[2]).toMatchObject({ debit: 0, credit: 300, accountCode: "3201" });
    // every stored amount is now non-negative…
    for (const l of lines) { expect(l.debit).toBeGreaterThanOrEqual(0); expect(l.credit).toBeGreaterThanOrEqual(0); }
    // …and the net movement of the whole entry is unchanged.
    expect(sumNet(lines)).toBe(before);
  });

  it("preserves balance: a balanced entry with negatives stays balanced (Σdebit = Σcredit)", () => {
    const lines = [
      { debit: -100, credit: 0 }, // ⇒ credit 100
      { debit: 0, credit: -100 }, // ⇒ debit 100  → balances the first
      { debit: 250, credit: 0 },
      { debit: 0, credit: 250 },
    ];
    const imbalanceBefore = lines.reduce((s, l) => s + l.debit, 0) - lines.reduce((s, l) => s + l.credit, 0);
    normalizeJournalLineSigns(lines);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    // imbalance is invariant under normalization (the property the balance gate relies on)…
    expect(totalDebit - totalCredit).toBe(imbalanceBefore);
    // …and this entry was balanced, so it remains balanced with non-negative storage.
    expect(totalDebit).toBe(totalCredit);
    expect(lines.every((l) => l.debit >= 0 && l.credit >= 0)).toBe(true);
  });

  it("merges the rare debit<0 && credit>0 case correctly (credit_new = credit + |debit|)", () => {
    const line = { debit: -100, credit: 30 };
    normalizeJournalLineSigns([line]);
    expect(line).toEqual({ debit: 0, credit: 130 });
    expect(net(line)).toBe(-130);
  });

  it("mutates in place and returns the same array reference", () => {
    const lines = [{ debit: -5, credit: 0 }];
    const ret = normalizeJournalLineSigns(lines);
    expect(ret).toBe(lines);
    expect(lines[0]).toEqual({ debit: 0, credit: 5 });
  });
});
