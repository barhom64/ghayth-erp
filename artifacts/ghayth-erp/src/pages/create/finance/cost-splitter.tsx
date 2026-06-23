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
import {
  SupplierSelect, AccountSelect, CostCenterSelect, VehicleSelect,
  ProjectSelect, EmployeeSelect, DriverSelect, ClientSelect,
} from "@/components/shared/entity-selects";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Copy, Calculator, Scale, AlertCircle, CheckCircle2,
  PieChart, Equal, Percent, Hash,
} from "lucide-react";

/**
 * Cost Allocation Splitter
 *
 * Real workflow: one supplier bill (e.g. "نظافة شهرية للأسطول 10,000 ر.س")
 * that must be split across N entities (5 vehicles, 3 properties, 4
 * projects, ...) by % share or fixed amount.
 *
 * Today the accountant either:
 *  - Posts one JE with no allocation (loses per-entity P&L)
 *  - Creates N separate expenses by hand (tedious, error-prone)
 *
 * This page does it as one balanced JE:
 *  - Header: total amount + tax code + expense account
 *  - Splits: N rows, each = an entity (vehicle/property/project/etc.)
 *           with allocation %, amount, optional override account
 *  - Three split modes: equal / percent / amount
 *  - Auto-balance enforced
 *  - Posts via /finance/journal with one debit line per split + one
 *    credit line for the AP/cash side
 */

interface TaxCode {
  id: number;
  code: string;
  name: string;
  rate: number | string;
  taxType: string;
  isActive: boolean;
}

type EntityType =
  | "vehicle" | "property" | "unit" | "project" | "contract"
  | "employee" | "driver" | "asset" | "client" | "umrah_agent" | "umrah_season";

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  vehicle: "مركبة", property: "عقار", unit: "وحدة سكنية",
  project: "مشروع", contract: "عقد",
  employee: "موظف", driver: "سائق", asset: "أصل ثابت",
  client: "عميل", umrah_agent: "مرشد عمرة", umrah_season: "موسم عمرة",
};

interface SplitRow {
  id: string;
  entityType: EntityType;
  entityId: string;
  costCenterId: string;
  overrideAccountCode: string;   // empty → uses header account
  percentage: number | string;    // for percent mode
  amount: number | string;        // for amount mode (or computed)
  description: string;
}

type SplitMode = "equal" | "percent" | "amount";

function emptyRow(defaultEntityType: EntityType = "vehicle"): SplitRow {
  return {
    id: Math.random().toString(36).slice(2),
    entityType: defaultEntityType,
    entityId: "",
    costCenterId: "",
    overrideAccountCode: "",
    percentage: 0,
    amount: 0,
    description: "",
  };
}

export default function CostSplitterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: taxCodesData } = useApiQuery<{ data: TaxCode[] }>(
    ["tax-codes-active"], `/finance/tax-codes?active=true`,
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

  const VAT_INPUT_CODE = "1300";

  const [header, setHeader] = useState({
    ref: "",
    supplierId: "",
    date: todayLocal(),
    paymentMethod: "credit" as "credit" | "cash" | "bank",
    cashAccountCode: "1100",
    bankAccountCode: "1200",
    apAccountCode: "2100",
    expenseAccountCode: "",
    description: "",
    totalAmount: "" as number | string,    // gross total to allocate
    taxCode: "VAT15",
    taxInclusive: false,
  });

  const [mode, setMode] = useState<SplitMode>("equal");
  const [defaultEntityType, setDefaultEntityType] = useState<EntityType>("vehicle");
  const [rows, setRows] = useState<SplitRow[]>([emptyRow(), emptyRow()]);

  // ── Tax split on the header total
  const taxSplit = useMemo(() => {
    const gross = Number(header.totalAmount) || 0;
    if (gross === 0) return { net: 0, vat: 0, gross: 0, rate: 0 };
    const tc = header.taxCode ? taxCodeMap.get(header.taxCode) : undefined;
    const rate = Number(tc?.rate ?? 0);
    if (rate === 0) return { net: gross, vat: 0, gross, rate: 0 };
    if (header.taxInclusive) {
      const net = roundMoney(gross / (1 + rate / 100));
      return { net, vat: roundMoney(gross - net), gross, rate };
    }
    const vat = roundMoney(gross * (rate / 100));
    return { net: gross, vat, gross: roundMoney(gross + vat), rate };
  }, [header.totalAmount, header.taxCode, header.taxInclusive, taxCodeMap]);

  const netToAllocate = taxSplit.net;

  // ── Compute the per-row amount based on mode
  const computedRows = useMemo(() => {
    if (rows.length === 0) return [];

    if (mode === "equal") {
      const each = roundMoney(netToAllocate / rows.length);
      // Last row absorbs rounding remainder
      const sumExceptLast = roundMoney(each * (rows.length - 1));
      const lastAmount = roundMoney(netToAllocate - sumExceptLast);
      return rows.map((r, idx) => ({
        ...r,
        computedAmount: idx === rows.length - 1 ? lastAmount : each,
        computedPercent: roundMoney((100 / rows.length) * 100) / 100,
      }));
    }

    if (mode === "percent") {
      return rows.map((r) => {
        const pct = Number(r.percentage) || 0;
        return {
          ...r,
          computedAmount: roundMoney((netToAllocate * pct) / 100),
          computedPercent: pct,
        };
      });
    }

    // amount mode
    return rows.map((r) => {
      const amt = Number(r.amount) || 0;
      return {
        ...r,
        computedAmount: amt,
        computedPercent: netToAllocate > 0 ? roundMoney((amt / netToAllocate) * 10000) / 100 : 0,
      };
    });
  }, [rows, mode, netToAllocate]);

  const totalSplit = useMemo(() =>
    roundMoney(computedRows.reduce((s, r) => s + (r.computedAmount || 0), 0)),
    [computedRows]
  );
  const totalPercent = useMemo(() =>
    roundMoney(computedRows.reduce((s, r) => s + (r.computedPercent || 0), 0) * 100) / 100,
    [computedRows]
  );

  const variance = roundMoney(netToAllocate - totalSplit);
  const balanced = Math.abs(variance) <= 0.01;

  const addRow = () => setRows((prev) => [...prev, emptyRow(defaultEntityType)]);
  const removeRow = (id: string) => setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  const duplicateRow = (id: string) => setRows((prev) => {
    const idx = prev.findIndex((r) => r.id === id);
    if (idx < 0) return prev;
    const copy = { ...prev[idx], id: Math.random().toString(36).slice(2) };
    return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
  });
  const updateRow = (id: string, patch: Partial<SplitRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const distributeRemainder = () => {
    if (rows.length === 0 || mode === "equal") return;
    if (mode === "amount") {
      const lastIdx = rows.length - 1;
      setRows((prev) => prev.map((r, i) => i === lastIdx
        ? { ...r, amount: roundMoney(Number(r.amount || 0) + variance) }
        : r));
    } else {
      const remainingPct = 100 - (totalPercent - (Number(rows[rows.length - 1].percentage) || 0));
      setRows((prev) => prev.map((r, i) => i === prev.length - 1
        ? { ...r, percentage: remainingPct }
        : r));
    }
  };

  const journalMut = useApiMutation("/finance/journal", "POST", [["journal"]]);

  const validate = (): string | null => {
    if (!header.ref.trim()) return "مرجع المستند مطلوب";
    if (!header.expenseAccountCode) return "حساب المصروف الافتراضي مطلوب";
    if (!header.totalAmount || Number(header.totalAmount) <= 0)
      return "إجمالي المصروف يجب أن يكون أكبر من صفر";
    if (header.paymentMethod === "credit" && !header.supplierId)
      return "المورد مطلوب للدفع الآجل";
    if (rows.length < 2) return "أضف صفّين على الأقل للتوزيع";
    if (!balanced) return `الفرق ${formatCurrency(variance)} — اضبط الأرقام أو اضغط "توزيع الفرق"`;
    for (let i = 0; i < computedRows.length; i++) {
      const r = computedRows[i];
      if (r.computedAmount <= 0) return `الصف ${i + 1}: المبلغ المحسوب يجب أن يكون أكبر من صفر`;
      if (!r.entityId) return `الصف ${i + 1}: اختر الكيان`;
    }
    return null;
  };

  const buildJournalLines = () => {
    type JL = Record<string, any>;
    const jls: JL[] = [];

    // One debit line per split (with its entity dimensions)
    for (const r of computedRows) {
      if (r.computedAmount <= 0) continue;
      const acct = r.overrideAccountCode || header.expenseAccountCode;
      const dims: any = {
        costCenterId: r.costCenterId ? Number(r.costCenterId) : undefined,
        vehicleId:     r.entityType === "vehicle"      && r.entityId ? Number(r.entityId) : undefined,
        propertyId:    r.entityType === "property"     && r.entityId ? Number(r.entityId) : undefined,
        unitId:        r.entityType === "unit"         && r.entityId ? Number(r.entityId) : undefined,
        projectId:     r.entityType === "project"      && r.entityId ? Number(r.entityId) : undefined,
        contractId:    r.entityType === "contract"     && r.entityId ? Number(r.entityId) : undefined,
        employeeId:    r.entityType === "employee"     && r.entityId ? Number(r.entityId) : undefined,
        driverId:      r.entityType === "driver"       && r.entityId ? Number(r.entityId) : undefined,
        assetId:       r.entityType === "asset"        && r.entityId ? Number(r.entityId) : undefined,
        clientId:      r.entityType === "client"       && r.entityId ? Number(r.entityId) : undefined,
        umrahAgentId:  r.entityType === "umrah_agent"  && r.entityId ? Number(r.entityId) : undefined,
        umrahSeasonId: r.entityType === "umrah_season" && r.entityId ? Number(r.entityId) : undefined,
      };
      Object.keys(dims).forEach((k) => dims[k] === undefined && delete dims[k]);

      jls.push({
        accountCode: acct,
        debit: r.computedAmount,
        credit: 0,
        description: r.description || `حصة ${ENTITY_TYPE_LABEL[r.entityType]} #${r.entityId} — ${r.computedPercent.toFixed(2)}%`,
        ...dims,
      });
    }

    // Single VAT input debit (if any)
    if (taxSplit.vat > 0) {
      jls.push({
        accountCode: VAT_INPUT_CODE,
        debit: taxSplit.vat,
        credit: 0,
        description: `VAT input — ${header.ref}`,
      });
    }

    // Single credit line for the AP/cash/bank side
    const creditAccountCode =
      header.paymentMethod === "cash"  ? header.cashAccountCode
      : header.paymentMethod === "bank" ? header.bankAccountCode
      : header.apAccountCode;
    jls.push({
      accountCode: creditAccountCode,
      debit: 0,
      credit: taxSplit.gross,
      description: header.description || `سداد ${header.ref}`,
      vendorId: header.supplierId ? Number(header.supplierId) : undefined,
    });

    return jls;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      const jls = buildJournalLines();
      await journalMut.mutateAsync({
        ref: header.ref,
        date: header.date,
        description: header.description || `توزيع تكلفة — ${header.ref}`,
        lines: jls,
      });
      toast({
        title: "تم ترحيل القيد",
        description: `${rows.length} كيان · إجمالي ${formatCurrency(taxSplit.gross)}`,
      });
      setLocation("/finance/expenses");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الترحيل", description: getErrorMessage(e) });
    }
  };

  return (
    <CreatePageLayout title="موزّع التكلفة على عدة كيانات" backPath="/finance/expenses">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <PieChart className="h-4 w-4" /> فاتورة واحدة، عدة كيانات
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            مثال: فاتورة نظافة شهرية بـ 10,000 ر.س لـ 5 مركبات. بدل ما تنشئ 5
            مصاريف منفصلة، اختر مرة واحدة: المبلغ + الحساب + كل المركبات،
            واختر طريقة التوزيع (متساوي / بالنسبة / بالمبلغ). الـ tool يولّد
            قيد JE واحد متوازن مع 5 سطور debit + سطر credit واحد.
          </p>
        </CardContent>
      </Card>

      {/* ── Header ──────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الفاتورة الأصلية</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">المرجع *</Label>
            <Input value={header.ref} onChange={(e) => setHeader({ ...header, ref: e.target.value })}
              placeholder="EXP-2026-001" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
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
          <div className="md:col-span-2">
            <AccountSelect value={header.expenseAccountCode} onChange={(v) => setHeader({ ...header, expenseAccountCode: String(v ?? "") })} label="حساب المصروف الافتراضي *" />
          </div>
          <div>
            <Label className="text-xs">الإجمالي (شامل أو غير شامل حسب الإعداد) *</Label>
            <Input type="number" step="0.01" value={header.totalAmount}
              onChange={(e) => setHeader({ ...header, totalAmount: e.target.value })}
              placeholder="10000.00" className="h-9 font-mono" />
          </div>
          <div>
            <Label className="text-xs">رمز الضريبة</Label>
            <Select value={header.taxCode || "_none"} onValueChange={(v) => setHeader({ ...header, taxCode: v === "_none" ? "" : v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">
                  <span className="text-blue-700 font-semibold">— بدون ضريبة —</span>
                </SelectItem>
                {taxCodes.filter((t: any) => t.code).map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.code} ({Number(t.rate)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              type="checkbox" id="taxInclusive"
              checked={header.taxInclusive}
              onChange={(e) => setHeader({ ...header, taxInclusive: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="taxInclusive" className="text-xs">المبلغ شامل الضريبة</Label>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">وصف</Label>
            <Textarea value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })}
              rows={2} placeholder="مثال: نظافة شهرية للأسطول مارس 2026" />
          </div>
        </CardContent>
      </Card>

      {/* ── Mode Selector ───────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" /> طريقة التوزيع
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Button
              variant={mode === "equal" ? "default" : "outline"}
              onClick={() => setMode("equal")}
              className="h-auto py-2 flex-col"
            >
              <Equal className="h-4 w-4 mb-1" />
              <span className="text-xs">متساوٍ</span>
              <span className="text-[10px] text-muted-foreground mt-1">المبلغ ÷ عدد الكيانات</span>
            </Button>
            <Button
              variant={mode === "percent" ? "default" : "outline"}
              onClick={() => setMode("percent")}
              className="h-auto py-2 flex-col"
            >
              <Percent className="h-4 w-4 mb-1" />
              <span className="text-xs">بالنسبة المئوية</span>
              <span className="text-[10px] text-muted-foreground mt-1">حصة % لكل كيان</span>
            </Button>
            <Button
              variant={mode === "amount" ? "default" : "outline"}
              onClick={() => setMode("amount")}
              className="h-auto py-2 flex-col"
            >
              <Hash className="h-4 w-4 mb-1" />
              <span className="text-xs">بالمبلغ المباشر</span>
              <span className="text-[10px] text-muted-foreground mt-1">رقم لكل كيان</span>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Label className="text-xs">نوع الكيان الافتراضي للصفوف الجديدة</Label>
              <Select value={defaultEntityType} onValueChange={(v) => setDefaultEntityType(v as EntityType)}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ENTITY_TYPE_LABEL) as Array<[EntityType, string]>).map(
                    ([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 me-1" /> إضافة كيان
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Split Rows ──────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4" /> توزيع الحصص ({rows.length} كيان)
          </CardTitle>
          {!balanced && (mode === "percent" || mode === "amount") && (
            <Button variant="outline" size="sm" onClick={distributeRemainder}>
              <Calculator className="h-3 w-3 me-1" />
              توزيع الفرق ({formatCurrency(variance)})
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {computedRows.map((r, idx) => {
            const isUnbalanced = r.computedAmount <= 0 && (Number(header.totalAmount) || 0) > 0;
            return (
              <div key={r.id} className={`p-3 rounded border ${isUnbalanced ? "border-amber-300 bg-amber-50/30" : "border-muted"}`}>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-[10px]">#{idx + 1}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => duplicateRow(r.id)} title="نسخ">
                      <Copy className="h-3 w-3" />
                    </Button>
                    {rows.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-700" onClick={() => removeRow(r.id)} title="حذف">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">نوع الكيان</Label>
                    <Select value={r.entityType} onValueChange={(v) => updateRow(r.id, { entityType: v as EntityType, entityId: "" })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(ENTITY_TYPE_LABEL) as Array<[EntityType, string]>).map(
                          ([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    {r.entityType === "vehicle" && (
                      <VehicleSelect value={r.entityId} onChange={(v) => updateRow(r.id, { entityId: String(v ?? "") })} label="المركبة *" />
                    )}
                    {r.entityType === "project" && (
                      <ProjectSelect value={r.entityId} onChange={(v) => updateRow(r.id, { entityId: String(v ?? "") })} label="المشروع *" />
                    )}
                    {r.entityType === "employee" && (
                      <EmployeeSelect value={r.entityId} onChange={(v) => updateRow(r.id, { entityId: String(v ?? "") })} label="الموظف *" />
                    )}
                    {r.entityType === "driver" && (
                      <DriverSelect value={r.entityId} onChange={(v) => updateRow(r.id, { entityId: String(v ?? "") })} label="السائق *" />
                    )}
                    {r.entityType === "client" && (
                      <ClientSelect value={r.entityId} onChange={(v) => updateRow(r.id, { entityId: String(v ?? "") })} label="العميل *" />
                    )}
                    {!["vehicle", "project", "employee", "driver", "client"].includes(r.entityType) && (
                      <div>
                        <Label className="text-xs">معرّف {ENTITY_TYPE_LABEL[r.entityType]} *</Label>
                        <Input type="number" value={r.entityId} onChange={(e) => updateRow(r.id, { entityId: e.target.value })}
                          placeholder="ID" className="h-9 font-mono" />
                      </div>
                    )}
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <CostCenterSelect value={r.costCenterId} onChange={(v) => updateRow(r.id, { costCenterId: String(v ?? "") })} label="مركز التكلفة" />
                  </div>

                  {/* Mode-specific inputs */}
                  {mode === "percent" && (
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">النسبة %</Label>
                      <Input type="number" step="0.01" value={r.percentage}
                        onChange={(e) => updateRow(r.id, { percentage: e.target.value })}
                        placeholder="20" className="h-9 font-mono" />
                    </div>
                  )}
                  {mode === "amount" && (
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">المبلغ</Label>
                      <Input type="number" step="0.01" value={r.amount}
                        onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                        placeholder="2000" className="h-9 font-mono" />
                    </div>
                  )}

                  <div className="col-span-12 md:col-span-8">
                    <Label className="text-xs">وصف الحصة (اختياري)</Label>
                    <Input value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value })}
                      placeholder={`حصة ${ENTITY_TYPE_LABEL[r.entityType]} من ${header.ref || "الفاتورة"}`}
                      className="h-9" />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">حساب بديل (اختياري)</Label>
                    <AccountSelect value={r.overrideAccountCode}
                      onChange={(v) => updateRow(r.id, { overrideAccountCode: String(v ?? "") })}
                      label="" />
                  </div>
                </div>

                {/* Per-row result chips */}
                <div className="mt-2 pt-2 border-t border-dashed flex items-center justify-end gap-3 text-xs">
                  <Badge variant="outline" className="font-mono">
                    {r.computedPercent.toFixed(2)}%
                  </Badge>
                  <span className="font-mono font-bold">{formatCurrency(r.computedAmount)}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Balance Indicator ──────────────────────────────────── */}
      <Card className={`mb-4 ${balanced ? "border-emerald-400 bg-emerald-50/30" : "border-amber-400 bg-amber-50/30"}`}>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">المبلغ الصافي</p>
              <p className="text-base font-mono font-bold">{formatCurrency(netToAllocate)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">مجموع التوزيع</p>
              <p className="text-base font-mono font-bold">{formatCurrency(totalSplit)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">% الإجمالي</p>
              <p className="text-base font-mono font-bold">{totalPercent.toFixed(2)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">الفرق</p>
              <p className={`text-base font-mono font-bold ${balanced ? "text-emerald-700" : "text-red-700"}`}>
                {balanced ? "✓ متوازن" : formatCurrency(variance)}
              </p>
            </div>
          </div>
          {!balanced && (
            <p className="text-xs text-amber-800 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              مجموع التوزيع لا يساوي المبلغ الصافي — اضبط الأرقام أو اضغط "توزيع الفرق"
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── JE Preview ─────────────────────────────────────────── */}
      {balanced && netToAllocate > 0 && (
        <Card className="mb-4 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3" /> معاينة القيد المحاسبي
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <DataTable<Record<string, any>>
              noToolbar
              pageSize={0}
              className="text-xs"
              data={buildJournalLines()}
              rowKey={(_jl, i) => i}
              columns={[
                {
                  key: "accountCode", header: "الحساب", align: "end",
                  render: (jl) => <span className="font-mono">{jl.accountCode}</span>,
                },
                {
                  key: "description", header: "الوصف", align: "end",
                  render: (jl) => <span className="text-muted-foreground">{jl.description}</span>,
                },
                {
                  key: "debit", header: "مدين", align: "end",
                  render: (jl) => (
                    <span className="font-mono text-emerald-700">
                      {Number(jl.debit) > 0 ? formatCurrency(Number(jl.debit)) : "—"}
                    </span>
                  ),
                },
                {
                  key: "credit", header: "دائن", align: "end",
                  render: (jl) => (
                    <span className="font-mono text-red-700">
                      {Number(jl.credit) > 0 ? formatCurrency(Number(jl.credit)) : "—"}
                    </span>
                  ),
                },
              ] satisfies DataTableColumn<Record<string, any>>[]}
              renderGrandTotal={() => (
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={2} className="p-1 text-end">الإجمالي</td>
                  <td className="p-1 font-mono text-end text-emerald-700">{formatCurrency(taxSplit.gross)}</td>
                  <td className="p-1 font-mono text-end text-red-700">{formatCurrency(taxSplit.gross)}</td>
                </tr>
              )}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
        <GuardedButton
          perm="finance:create"
          onClick={handleSubmit}
          disabled={journalMut.isPending || !balanced || netToAllocate === 0}
          rateLimitAware
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {journalMut.isPending
            ? "جاري الترحيل..."
            : <><CheckCircle2 className="h-4 w-4 me-1" /> ترحيل القيد الموزَّع</>}
        </GuardedButton>
      </div>
    </CreatePageLayout>
  );
}
