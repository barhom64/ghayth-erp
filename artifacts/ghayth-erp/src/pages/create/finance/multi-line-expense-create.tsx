import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { CreatePageLayout } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SupplierSelect, AccountSelect, CostCenterSelect, VehicleSelect, ProjectSelect } from "@/components/shared/entity-selects";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Copy, Receipt, Layers, AlertCircle, CheckCircle2,
} from "lucide-react";

/**
 * Multi-Line Expense Builder
 *
 * Solves three real pain points the user surfaced:
 *
 * 1) Single supplier invoice with 10+ different expense lines —
 *    different account, different cost center, different entity
 *    (vehicle / property / unit / project) per line.
 *
 * 2) Mixed VAT in the same document — some lines VAT15, some VAT0
 *    (no tax), some EXEMPT. Per-line tax code with explicit "بدون ضريبة".
 *
 * 3) Posts as a single JE via /finance/journal so AP balance equals
 *    the sum of all gross lines (with per-line tax credits to VAT
 *    input account 1300).
 *
 * The existing expenses-create.tsx is single-line + single-tax + single
 * entity. This page is the multi-line equivalent for power users.
 */

interface TaxCode {
  id: number;
  code: string;
  name: string;
  rate: number | string;
  taxType: string;
  isInclusiveDefault?: boolean;
  isActive: boolean;
  accountId?: number | null;
  accountCode?: string | null;
}

type EntityType = "" | "vehicle" | "property" | "unit" | "project" | "contract";

interface ExpenseLine {
  id: string;
  accountCode: string;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  taxCode: string;            // "" = بدون ضريبة (explicit no-tax)
  taxInclusive: boolean;       // false by default — exclusive
  costCenterId: string;
  entityType: EntityType;
  vehicleId: string;
  propertyId: string;
  unitId: string;
  projectId: string;
  contractId: string;
}

function emptyLine(): ExpenseLine {
  return {
    id: Math.random().toString(36).slice(2),
    accountCode: "",
    description: "",
    quantity: 1,
    unitPrice: "",
    taxCode: "VAT15",
    taxInclusive: false,
    costCenterId: "",
    entityType: "",
    vehicleId: "",
    propertyId: "",
    unitId: "",
    projectId: "",
    contractId: "",
  };
}

function computeLine(line: ExpenseLine, taxCodes: Map<string, TaxCode>): { net: number; vat: number; gross: number; rate: number } {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const amount = roundMoney(qty * price);
  if (amount === 0) return { net: 0, vat: 0, gross: 0, rate: 0 };

  if (!line.taxCode) {
    return { net: amount, vat: 0, gross: amount, rate: 0 };
  }
  const tc = taxCodes.get(line.taxCode);
  const rate = Number(tc?.rate ?? 0);
  if (rate === 0) {
    return { net: amount, vat: 0, gross: amount, rate: 0 };
  }
  if (line.taxInclusive) {
    const net = roundMoney(amount / (1 + rate / 100));
    const vat = roundMoney(amount - net);
    return { net, vat, gross: amount, rate };
  }
  const vat = roundMoney(amount * (rate / 100));
  return { net: amount, vat, gross: roundMoney(amount + vat), rate };
}

export default function MultiLineExpenseCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: taxCodesData } = useApiQuery<{ data: TaxCode[] }>(
    ["tax-codes-active"], `/finance/accounts/tax-codes?active=true`,
  );
  const taxCodes = useMemo(
    () => (taxCodesData?.data ?? []).filter((t) => t.isActive !== false),
    [taxCodesData],
  );
  const taxCodeMap = useMemo(() => {
    const m = new Map<string, TaxCode>();
    for (const t of taxCodes) m.set(t.code, t);
    return m;
  }, [taxCodes]);

  // VAT input account — default 1300 (VAT input). Can be looked up via account-mappings.
  const VAT_INPUT_CODE = "1300";

  const [header, setHeader] = useState({
    ref: "",
    supplierId: "",
    date: todayLocal(),
    paymentMethod: "credit" as "credit" | "cash" | "bank",
    cashAccountCode: "1100",  // الصندوق
    bankAccountCode: "1200",  // البنك
    apAccountCode: "2100",    // الذمم الدائنة
    description: "",
  });

  const [lines, setLines] = useState<ExpenseLine[]>([emptyLine(), emptyLine()]);

  const totals = useMemo(() => {
    let net = 0, vat = 0, gross = 0;
    let noTaxCount = 0, vatCount = 0;
    for (const line of lines) {
      const c = computeLine(line, taxCodeMap);
      net += c.net; vat += c.vat; gross += c.gross;
      if (c.rate === 0 && c.gross > 0) noTaxCount += 1;
      if (c.rate > 0) vatCount += 1;
    }
    return {
      net: roundMoney(net),
      vat: roundMoney(vat),
      gross: roundMoney(gross),
      noTaxCount,
      vatCount,
    };
  }, [lines, taxCodeMap]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const duplicateLine = (id: string) => setLines((prev) => {
    const idx = prev.findIndex((l) => l.id === id);
    if (idx < 0) return prev;
    const copy = { ...prev[idx], id: Math.random().toString(36).slice(2) };
    return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
  });
  const updateLine = (id: string, patch: Partial<ExpenseLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const journalMut = useApiMutation("/finance/journal", "POST", [["journal"]]);

  const validate = (): string | null => {
    if (!header.ref.trim()) return "مرجع المستند مطلوب";
    if (!header.date) return "التاريخ مطلوب";
    if (header.paymentMethod === "credit" && !header.supplierId)
      return "المورد مطلوب للدفع الآجل";
    if (lines.length === 0) return "أضف بنداً واحداً على الأقل";

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const c = computeLine(l, taxCodeMap);
      if (c.gross === 0) continue; // skip empty rows
      if (!l.accountCode) return `البند ${i + 1}: حساب المصروف مطلوب`;
    }

    if (totals.gross <= 0) return "إجمالي المستند يجب أن يكون أكبر من صفر";
    return null;
  };

  const buildJournalLines = () => {
    type JL = Record<string, any>;
    const jls: JL[] = [];

    // Debit side — one entry per expense line (with dimensions)
    let totalDebit = 0;
    for (const l of lines) {
      const c = computeLine(l, taxCodeMap);
      if (c.gross === 0) continue;

      // Net expense debit
      const dims: any = {
        costCenterId: l.costCenterId ? Number(l.costCenterId) : undefined,
        vehicleId: l.entityType === "vehicle" && l.vehicleId ? Number(l.vehicleId) : undefined,
        propertyId: l.entityType === "property" && l.propertyId ? Number(l.propertyId) : undefined,
        unitId: l.entityType === "unit" && l.unitId ? Number(l.unitId) : undefined,
        projectId: l.entityType === "project" && l.projectId ? Number(l.projectId) : undefined,
        contractId: l.entityType === "contract" && l.contractId ? Number(l.contractId) : undefined,
      };
      Object.keys(dims).forEach((k) => dims[k] === undefined && delete dims[k]);

      jls.push({
        accountCode: l.accountCode,
        debit: c.net,
        credit: 0,
        description: l.description || `بند ${l.accountCode}`,
        ...dims,
      });
      totalDebit += c.net;

      // VAT input debit per line (if any)
      if (c.vat > 0) {
        jls.push({
          accountCode: VAT_INPUT_CODE,
          debit: c.vat,
          credit: 0,
          description: `VAT input — ${l.description || l.accountCode}`,
          ...dims,
        });
        totalDebit += c.vat;
      }
    }

    // Credit side — single entry to AP / cash / bank
    const creditAccountCode =
      header.paymentMethod === "cash"
        ? header.cashAccountCode
        : header.paymentMethod === "bank"
          ? header.bankAccountCode
          : header.apAccountCode;
    jls.push({
      accountCode: creditAccountCode,
      debit: 0,
      credit: totals.gross,
      description: header.description || `سداد ${header.ref}`,
      vendorId: header.supplierId ? Number(header.supplierId) : undefined,
    });

    void totalDebit;
    return jls;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      const journalLines = buildJournalLines();
      await journalMut.mutateAsync({
        ref: header.ref,
        date: header.date,
        description: header.description || `مصروف متعدد البنود — ${header.ref}`,
        lines: journalLines,
      });
      toast({
        title: "تم ترحيل المصروف",
        description: `${lines.length} بند · إجمالي ${formatCurrency(totals.gross)}`,
      });
      setLocation("/finance/expenses");
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر الترحيل", description: getErrorMessage(e) });
    }
  };

  return (
    <CreatePageLayout title="مصروف متعدد البنود" backPath="/finance/expenses">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Layers className="h-4 w-4" /> فاتورة مورد بـ 10 بنود مختلفة؟ هذي صفحتك.
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside mt-1 space-y-0.5">
            <li>كل بند له <strong>حساب مصروف</strong> منفصل</li>
            <li>كل بند له <strong>مركز تكلفة + كيان</strong> منفصل (مركبة A / عقار B / وحدة C / مشروع D)</li>
            <li>كل بند له <strong>رمز ضريبة</strong> منفصل — <strong>VAT15 أو 0% أو EXEMPT أو بدون ضريبة</strong></li>
            <li>كل البنود في قيد JE واحد ضد مورد واحد أو نقد/بنك</li>
          </ul>
        </CardContent>
      </Card>

      {/* ── Header ──────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات المستند</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">المرجع *</Label>
            <Input value={header.ref} onChange={(e) => setHeader({ ...header, ref: e.target.value })}
              placeholder="EXP-2026-001 / رقم فاتورة المورد" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">التاريخ *</Label>
            <Input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">طريقة السداد</Label>
            <Select value={header.paymentMethod} onValueChange={(v) => setHeader({ ...header, paymentMethod: v as any })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">آجل (مورد)</SelectItem>
                <SelectItem value="cash">نقد</SelectItem>
                <SelectItem value="bank">تحويل بنكي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {header.paymentMethod === "credit" && (
            <div className="md:col-span-3">
              <SupplierSelect value={header.supplierId} onChange={(v) => setHeader({ ...header, supplierId: String(v ?? "") })} label="المورد *" />
            </div>
          )}
          <div className="md:col-span-3">
            <Label className="text-xs">وصف المستند</Label>
            <Textarea value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })}
              rows={2} placeholder="مثال: فاتورة ديزل مارس 2026 لكامل الأسطول" />
          </div>
        </CardContent>
      </Card>

      {/* ── Lines ──────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" /> بنود المصروف ({lines.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 me-1" /> بند جديد
          </Button>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {lines.map((line, idx) => {
            const c = computeLine(line, taxCodeMap);
            const noTax = c.rate === 0 && c.gross > 0;
            return (
              <div key={line.id} className={`p-3 rounded border ${noTax ? "border-blue-300 bg-blue-50/20" : c.gross > 0 ? "border-emerald-300 bg-emerald-50/10" : "border-muted"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">#{idx + 1}</Badge>
                    {c.gross > 0 && (
                      noTax
                        ? <Badge className="bg-blue-100 text-blue-800 text-[10px]">بدون ضريبة</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">ضريبة {c.rate}%</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => duplicateLine(line.id)} title="نسخ">
                      <Copy className="h-3 w-3" />
                    </Button>
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-700" onClick={() => removeLine(line.id)} title="حذف">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  {/* Account */}
                  <div className="col-span-12 md:col-span-4">
                    <AccountSelect
                      value={line.accountCode}
                      onChange={(v) => updateLine(line.id, { accountCode: String(v ?? "") })}
                      label="حساب المصروف *"
                    />
                  </div>
                  {/* Description */}
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">الوصف</Label>
                    <Input value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      placeholder="وصف البند" className="h-9" />
                  </div>
                  {/* Quantity */}
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-xs">الكمية</Label>
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} className="h-9" />
                  </div>
                  {/* Unit price */}
                  <div className="col-span-5 md:col-span-2">
                    <Label className="text-xs">السعر</Label>
                    <Input type="number" value={line.unitPrice} onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })} className="h-9" placeholder="0.00" />
                  </div>
                  {/* Tax code — with explicit "no tax" */}
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs">رمز الضريبة</Label>
                    <Select value={line.taxCode || "_none"} onValueChange={(v) => updateLine(line.id, { taxCode: v === "_none" ? "" : v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">
                          <span className="text-blue-700 font-semibold">— بدون ضريبة —</span>
                        </SelectItem>
                        {taxCodes.map((t) => (
                          <SelectItem key={t.id} value={t.code}>
                            {t.code} · {t.name} ({Number(t.rate)}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Dimensions row */}
                  <div className="col-span-12 md:col-span-4">
                    <CostCenterSelect value={line.costCenterId} onChange={(v) => updateLine(line.id, { costCenterId: String(v ?? "") })} label="مركز التكلفة" />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">نوع الكيان المرتبط</Label>
                    <Select value={line.entityType || "_none"} onValueChange={(v) => updateLine(line.id, {
                      entityType: v === "_none" ? "" : v as EntityType,
                      vehicleId: "", propertyId: "", unitId: "", projectId: "", contractId: "",
                    })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="بدون" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— بدون كيان —</SelectItem>
                        <SelectItem value="vehicle">مركبة</SelectItem>
                        <SelectItem value="property">عقار</SelectItem>
                        <SelectItem value="unit">وحدة سكنية</SelectItem>
                        <SelectItem value="project">مشروع</SelectItem>
                        <SelectItem value="contract">عقد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    {line.entityType === "vehicle" && (
                      <VehicleSelect value={line.vehicleId} onChange={(v) => updateLine(line.id, { vehicleId: String(v ?? "") })} label="المركبة" />
                    )}
                    {line.entityType === "property" && (
                      <div>
                        <Label className="text-xs">معرّف العقار</Label>
                        <Input type="number" value={line.propertyId} onChange={(e) => updateLine(line.id, { propertyId: e.target.value })}
                          placeholder="property id" className="h-9 font-mono" />
                      </div>
                    )}
                    {line.entityType === "unit" && (
                      <div>
                        <Label className="text-xs">معرّف الوحدة السكنية</Label>
                        <Input type="number" value={line.unitId} onChange={(e) => updateLine(line.id, { unitId: e.target.value })}
                          placeholder="unit id" className="h-9 font-mono" />
                      </div>
                    )}
                    {line.entityType === "project" && (
                      <ProjectSelect value={line.projectId} onChange={(v) => updateLine(line.id, { projectId: String(v ?? "") })} label="المشروع" />
                    )}
                    {line.entityType === "contract" && (
                      <div>
                        <Label className="text-xs">معرّف العقد</Label>
                        <Input type="number" value={line.contractId} onChange={(e) => updateLine(line.id, { contractId: e.target.value })}
                          placeholder="contract id" className="h-9 font-mono" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-line totals */}
                {c.gross > 0 && (
                  <div className="mt-3 pt-2 border-t border-dashed flex items-center justify-end gap-4 text-xs">
                    <span className="text-muted-foreground">صافي:</span>
                    <span className="font-mono font-semibold">{formatCurrency(c.net)}</span>
                    <span className="text-muted-foreground">ضريبة:</span>
                    <span className={`font-mono font-semibold ${c.vat === 0 ? "text-muted-foreground" : ""}`}>
                      {c.vat === 0 ? "—" : formatCurrency(c.vat)}
                    </span>
                    <span className="text-muted-foreground">الإجمالي:</span>
                    <span className="font-mono font-bold">{formatCurrency(c.gross)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Totals ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ملخص</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="text-center p-2 bg-muted/30 rounded">
            <p className="text-xs text-muted-foreground">عدد البنود</p>
            <p className="text-lg font-bold font-mono">{lines.filter((l) => computeLine(l, taxCodeMap).gross > 0).length}</p>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded">
            <p className="text-xs text-muted-foreground">بنود بدون ضريبة</p>
            <p className="text-lg font-bold font-mono text-blue-700">{totals.noTaxCount}</p>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded">
            <p className="text-xs text-muted-foreground">بنود بضريبة</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{totals.vatCount}</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded">
            <p className="text-xs text-muted-foreground">إجمالي صافي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totals.net)}</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded">
            <p className="text-xs text-muted-foreground">VAT</p>
            <p className="text-lg font-bold font-mono text-amber-700">{formatCurrency(totals.vat)}</p>
          </div>
          <div className="col-span-2 md:col-span-5 text-center p-3 bg-status-info-surface/40 rounded border border-status-info-surface">
            <p className="text-xs text-muted-foreground mb-0.5">الإجمالي الكلي</p>
            <p className="text-2xl font-bold font-mono text-status-info-foreground">{formatCurrency(totals.gross)}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── JE Preview ─────────────────────────────────────────── */}
      {totals.gross > 0 && (
        <Card className="mb-4 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" /> معاينة القيد المحاسبي قبل الترحيل
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-end p-1">الحساب</th>
                  <th className="text-end p-1">الوصف</th>
                  <th className="text-end p-1">مدين</th>
                  <th className="text-end p-1">دائن</th>
                </tr>
              </thead>
              <tbody>
                {buildJournalLines().map((jl, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="p-1 font-mono">{jl.accountCode}</td>
                    <td className="p-1 text-muted-foreground">{jl.description}</td>
                    <td className="p-1 font-mono text-end text-emerald-700">
                      {Number(jl.debit) > 0 ? formatCurrency(Number(jl.debit)) : "—"}
                    </td>
                    <td className="p-1 font-mono text-end text-red-700">
                      {Number(jl.credit) > 0 ? formatCurrency(Number(jl.credit)) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={2} className="p-1 text-end">الإجمالي</td>
                  <td className="p-1 font-mono text-end text-emerald-700">{formatCurrency(totals.gross)}</td>
                  <td className="p-1 font-mono text-end text-red-700">{formatCurrency(totals.gross)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Submit ─────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
        <GuardedButton
          perm="finance:create"
          onClick={handleSubmit}
          disabled={journalMut.isPending || totals.gross === 0}
          rateLimitAware
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {journalMut.isPending
            ? "جاري الترحيل..."
            : <><CheckCircle2 className="h-4 w-4 me-1" /> ترحيل القيد</>}
        </GuardedButton>
      </div>

      {totals.gross === 0 && lines.some((l) => l.accountCode) && (
        <Card className="mt-3 border-amber-300 bg-amber-50/30">
          <CardContent className="p-3 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            هناك بنود بحساب لكن بدون مبلغ — أدخل سعر/كمية لكل بند قبل الترحيل.
          </CardContent>
        </Card>
      )}
    </CreatePageLayout>
  );
}
