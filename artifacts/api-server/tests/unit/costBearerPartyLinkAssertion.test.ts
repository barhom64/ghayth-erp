import { describe, it, expect } from "vitest";
import { resolveObligationParty } from "../../src/lib/financeDocumentService.js";
import { buildDocumentPersistencePlan } from "../../src/lib/financeDocumentJournal.js";

/**
 * البند ٤ ج-١ — ربط costBearer بالطرف المحدَّد (سائق/موظف) لا بنوع الفئة فقط.
 *
 * جانبان (كما في الخطة «تُربط الذمة + الالتزام بذلك الطرف بعينه»):
 *   (أ) **الالتزام** — resolveObligationParty (المنطق الجديد): حين يحمل التوزيع مُعرِّف
 *       الطرف المطابق، تُربط مطالبة الاسترداد بالطرف بعينه؛ وإلا بكيان التوزيع.
 *   (ب) **الذمة** — ساق ذمة الطرف تحمل بُعد الطرف (driverId/employeeId) فيستبدلها
 *       enricher الأبعاد (مُفعَّل افتراضًا #3062) بالحساب الفرعي للطرف لا حساب الفئة.
 *       assertion نقيّ على سطور القيد (الدستور قاعدة ٣).
 */
describe("ج-١ (أ) — resolveObligationParty يربط الطرف المحدَّد", () => {
  it("سائق بمُعرِّف driverId → يُربط بالسائق بعينه لا بالمركبة", () => {
    const p = resolveObligationParty("driver", { entityType: "vehicle", entityId: 3, dims: { driverId: 7 } });
    expect(p).toEqual({ entityType: "driver", entityId: 7 });
  });

  it("موظف بمُعرِّف employeeId → يُربط بالموظف بعينه", () => {
    const p = resolveObligationParty("employee", { entityType: "vehicle", entityId: 3, dims: { employeeId: 42 } });
    expect(p).toEqual({ entityType: "employee", entityId: 42 });
  });

  it("سائق بلا driverId → يسقط لكيان التوزيع (السلوك السابق محفوظ)", () => {
    const p = resolveObligationParty("driver", { entityType: "vehicle", entityId: 3, dims: {} });
    expect(p).toEqual({ entityType: "vehicle", entityId: 3 });
  });

  it("متحمِّل طرفٌ خارجي (insurance) → يبقى على كيان التوزيع (لا مُعرِّف طرف داخلي)", () => {
    const p = resolveObligationParty("insurance", { entityType: "vehicle", entityId: 3, dims: { driverId: 7 } });
    expect(p).toEqual({ entityType: "vehicle", entityId: 3 });
  });

  it("مُعرِّف غير صالح (صفر/سالب) → يسقط لكيان التوزيع", () => {
    expect(resolveObligationParty("driver", { entityType: "vehicle", entityId: 3, dims: { driverId: 0 } }))
      .toEqual({ entityType: "vehicle", entityId: 3 });
    expect(resolveObligationParty("employee", { entityType: "vehicle", entityId: 3, dims: { employeeId: -5 } }))
      .toEqual({ entityType: "vehicle", entityId: 3 });
  });
});

describe("ج-١ (ب) — ساق ذمة الطرف تحمل بُعد الطرف (الذمة تُربط بالطرف عبر الاستبدال)", () => {
  const sumDebit = (legs: { debit: number }[]) => legs.reduce((s, l) => s + l.debit, 0);
  const sumCredit = (legs: { credit: number }[]) => legs.reduce((s, l) => s + l.credit, 0);

  it("متحمِّل سائق محدَّد: ساق الذمة (override 1143) تحمل driverId فيحلّ enricher الحساب الفرعي للسائق", () => {
    // شكل بند fuel-event: مركبة 100%، متحمِّله سائق محدَّد، حساب ذمة الفئة (1143) كـoverride.
    const { journalLegs: legs } = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "1111" },
      [
        {
          lineNo: 1,
          quantity: 100,
          unitPrice: 2, // صافي 200
          taxRatePercent: 0,
          counterAccountCode: "5510",
          allocations: [
            { entityType: "vehicle", entityId: 3, allocationType: "percent", percent: 100, costBearer: "driver", dims: { driverId: 7 }, overrideAccountCode: "1143" },
          ],
        },
      ],
    );
    // ساق المدين = ذمة الطرف (1143) لا مصروف الوقود، وتحمل بُعد السائق + المركبة.
    const arLeg = legs.find((l) => l.accountCode === "1143")!;
    expect(arLeg.debit).toBeCloseTo(200, 2);
    expect(arLeg.dims?.driverId).toBe(7); // ← الاستبدال يحلّ الحساب الفرعي للسائق من هذا البُعد
    expect(arLeg.entityRef).toEqual({ entityType: "vehicle", entityId: 3 });
    expect(legs.find((l) => l.accountCode === "5510")).toBeUndefined(); // المصروف اجتُبّ بذمة الطرف
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });
});
