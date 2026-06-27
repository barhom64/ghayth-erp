import { roundMoney } from "@/lib/formatters";

export interface TaxSplit {
  net: number;
  vat: number;
  gross: number;
}

export function amountTaxSplit(amount: number, rate: number, inclusive: boolean): TaxSplit {
  if (!amount || !rate) return { net: amount || 0, vat: 0, gross: amount || 0 };
  if (inclusive) {
    const net = roundMoney(amount / (1 + rate / 100));
    return { net, vat: roundMoney(amount - net), gross: amount };
  }
  const vat = roundMoney(amount * (rate / 100));
  return { net: amount, vat, gross: roundMoney(amount + vat) };
}

export function lineTaxSplit(
  qty: number,
  unitPrice: number,
  rate: number,
  inclusive: boolean,
): TaxSplit {
  return amountTaxSplit(roundMoney(qty * unitPrice), rate, inclusive);
}

export interface TaxCodeLike {
  code: string;
  taxType?: string;
  isActive?: boolean;
}

/**
 * B3 (توجيه إبراهيم) — رمز الضريبة الافتراضي = القياسي لا «بدون».
 * يحسم الرمز الافتراضي للأسطر الجديدة من الأكواد الفعّالة للشركة:
 *  - إن كان `current` كودًا فعّالًا موجودًا أبقاه (يحترم اختيار المستخدم/الترحيل).
 *  - وإلا فضّل النوع القياسي (`taxType === "standard"`) ثم أول كود فعّال.
 *  - يُرجع `undefined` متى لا يوجد كود فعّال (تبقى الترويسة على حالها).
 * نقّي الاعتماد على ثابت مزروع (مثل "VAT15") كان يسقط بصمت إلى «— بدون —»
 * متى زُرع/خُصِّص الكود القياسي لدى الشركة برمز مختلف.
 */
export function resolveDefaultTaxCode(
  taxCodes: TaxCodeLike[],
  current?: string,
): string | undefined {
  const active = taxCodes.filter((t) => t.isActive !== false && !!t.code);
  if (active.length === 0) return undefined;
  if (current && active.some((t) => t.code === current)) return current;
  const std = active.find((t) => t.taxType === "standard") ?? active[0];
  return std?.code;
}
