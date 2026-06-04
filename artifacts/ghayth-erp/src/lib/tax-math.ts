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
