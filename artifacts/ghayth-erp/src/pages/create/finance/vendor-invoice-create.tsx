import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { todayLocal } from "@/lib/formatters";
import { formatCurrency } from "@/lib/formatters";
import { filterAccountsForPaymentMethod, isMoneyAccount } from "@/lib/finance-account-usage";
import { Paperclip } from "lucide-react";
import { usePermission } from "@/components/shared/permission-gate";
import { type Attachment } from "@/components/shared/file-drop-zone";
import { SupplierSelect, BranchSelect, CostCenterSelect } from "@/components/shared/entity-selects";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { PAYMENT_STATUS_LABELS } from "@/lib/finance/status-model";
import { useAppContext } from "@/contexts/app-context";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { LiveImpactPreview } from "@/components/shared/impact-preview";
import { FinancialAttachmentViewer } from "@/components/shared/financial-attachment-viewer";
import { SupplierItemPicker, type SupplierItem } from "@/components/shared/supplier-item-picker";
import { useSupplierFinanceDefaults, useSupplierItems } from "@/lib/financial-memory";
import { ACCOUNT_PURPOSE_OPTIONS } from "@/lib/finance/account-purposes";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// accountPurpose options (TEXT). The financial engine resolves each to a GL
// account on the server — the UI NEVER carries a GL code (FIN-P11 #2241).
// ACCOUNT_PURPOSE_OPTIONS مُوحَّد في @/lib/finance/account-purposes (مصدر واحد
// مع صفحة فاتورة المورد التشغيلية م٤؛ المفاتيح عقدٌ مع المحرّك المالي).

interface VendorInvoiceLine {
  itemId?: number;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxCode: string;
  vatAmount: string;
  accountPurpose: string;
  scenario: string;
  costCenterId: string;
  allocation: LineAllocation;
}

function emptyLine(seed?: Partial<VendorInvoiceLine>): VendorInvoiceLine {
  return {
    itemName: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    taxCode: "",
    vatAmount: "",
    accountPurpose: seed?.accountPurpose ?? "",
    scenario: "",
    costCenterId: seed?.costCenterId ?? "",
    allocation: {},
  };
}

function lineAmount(l: VendorInvoiceLine): number {
  const q = Number(l.quantity) || 0;
  const p = Number(l.unitPrice) || 0;
  return Number((q * p).toFixed(2));
}

export default function VendorInvoiceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const activeCtx = useActiveFinanceContext();
  const createMut = useApiMutation("/finance/vendor-invoices", "POST", [["expenses"], ["vendor-invoices"]]);
  const canReplace = usePermission("finance:approve");

  const { data: accountsData, isLoading: accountsLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];
  const moneyAccounts = accounts.filter((a: any) => isMoneyAccount(a));

  // البند ٤ — أكواد الضريبة الفعّالة لمنتقي رمز ضريبة البند (بدل النص الحر).
  // رمز البند يحدّد حساب ضريبة المدخلات في المعالج (resolveVendorInvoicePlan).
  const { data: taxCodesData } = useApiQuery<{ data: Array<{ code: string; name: string; rate: number | string; isActive: boolean }> }>(
    ["tax-codes"],
    "/finance/tax-codes",
  );
  const taxCodes = useMemo(
    () => (taxCodesData?.data ?? []).filter((t) => t.isActive && t.code),
    [taxCodesData],
  );

  const [supplierId, setSupplierId] = useState("");
  const [paid, setPaid] = useState(false);
  const [sourceAccountCode, setSourceAccountCode] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [branchId, setBranchId] = useState(selectedBranchId ? String(selectedBranchId) : "");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<VendorInvoiceLine[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [journalBlockers, setJournalBlockers] = useState<{ code: string; message: string }[]>([]);

  // MEMORY SLICE — seed defaults from the supplier (payment/currency/purpose/cc).
  // The hook NEVER returns a GL code; the engine stays authoritative.
  const { data: supplierDefaultsData } = useSupplierFinanceDefaults(supplierId || null);
  const supplierDefaults = supplierDefaultsData?.data;
  // Supplier item memory (used to constrain scenarios / snap defaults).
  useSupplierItems(supplierId || null);

  useEffect(() => {
    if (!supplierDefaults) return;
    // seed payment method and the default account purpose / cost-center for the
    // (still-empty) first line, without clobbering anything the operator typed.
    if (supplierDefaults.defaultPaymentMethod && supplierDefaults.defaultPaymentMethod !== "credit") setPaid(true);
    setLines((prev) => prev.map((l) => {
      if (l.accountPurpose || l.itemName) return l;
      return {
        ...l,
        accountPurpose: supplierDefaults.defaultAccountPurpose ?? l.accountPurpose,
        costCenterId: supplierDefaults.defaultCostCenterId != null ? String(supplierDefaults.defaultCostCenterId) : l.costCenterId,
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierDefaults?.supplierId]);

  // paid → show source picker (narrowed to money accounts); credit → forbid it.
  const sourceAccounts = filterAccountsForPaymentMethod(moneyAccounts, paid ? "cash" : "credit");
  const sourceOptions: AutocompleteOption[] = sourceAccounts.map((a: any) => ({ value: a.code || String(a.id), label: `${a.code} - ${a.name}` }));

  const applyAttachmentFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachments([{ name: file.name, size: file.size, type: file.type, dataUrl }]);
      setAttachmentUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };
  const clearAttachment = () => {
    setAttachments([]);
    setAttachmentUrl((u) => (u.startsWith("data:") ? "" : u));
  };
  const viewerAttachments = attachmentUrl
    ? [{ url: attachmentUrl, name: attachments[0]?.name, type: attachments[0]?.type ?? null, documentType: "فاتورة", serialNo: null, status: "linked" }]
    : [];

  if (accountsLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  // toggling credit clears the (now-forbidden) money source.
  const setPaidToggle = (v: boolean) => {
    setPaid(v);
    if (!v) setSourceAccountCode("");
  };

  const updateLine = (i: number, patch: Partial<VendorInvoiceLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const onPickItem = (i: number, item: SupplierItem | null) => {
    if (!item) { updateLine(i, { itemId: undefined }); return; }
    // snap unit / taxCode / unitPrice(lastPrice) / accountPurpose from memory.
    updateLine(i, {
      itemId: item.id,
      itemName: item.name,
      unit: item.defaultUnit ?? "",
      taxCode: item.defaultTaxCodeId != null ? String(item.defaultTaxCodeId) : "",
      unitPrice: item.lastPrice != null ? String(item.lastPrice) : "",
      accountPurpose: item.accountPurpose ?? "",
      // constrain scenario to the item's allowed scenarios (first allowed).
      scenario: item.allowedScenarios && item.allowedScenarios.length > 0 ? item.allowedScenarios[0] : "",
    });
  };

  const totalNet = lines.reduce((s, l) => s + lineAmount(l), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmount) || 0), 0);
  const totalWithVat = Number((totalNet + totalVat).toFixed(2));

  // build the impact-preview / save line payload (accountPurpose TEXT only).
  const buildLinePayload = () =>
    lines
      .filter((l) => l.accountPurpose && lineAmount(l) > 0)
      .map((l) => ({
        itemId: l.itemId,
        itemName: l.itemName || undefined,
        quantity: l.quantity ? Number(l.quantity) : undefined,
        unit: l.unit || undefined,
        unitPrice: l.unitPrice ? Number(l.unitPrice) : undefined,
        taxCode: l.taxCode || undefined,
        amount: lineAmount(l),
        vatAmount: l.vatAmount ? Number(l.vatAmount) : undefined,
        accountPurpose: l.accountPurpose,
        scenario: l.scenario || undefined,
        costCenterId: l.costCenterId ? Number(l.costCenterId) : undefined,
        ...(Object.values(l.allocation).some((v) => v != null && v !== "") ? buildAllocationPayload(l.allocation) : {}),
      }));

  const previewReady = !!supplierId && buildLinePayload().length > 0 && (paid ? !!sourceAccountCode : !sourceAccountCode);

  const handleSubmit = async () => {
    if (!supplierId) { toast({ variant: "destructive", title: "اختر المورد" }); return; }
    // الفرع اختياري في الخلفية ويُعبّأ من سياق الدخول — لا يُفرض على المستخدم.
    const payloadLines = buildLinePayload();
    if (payloadLines.length === 0) { toast({ variant: "destructive", title: "أضف بندًا واحدًا على الأقل بغرض حساب ومبلغ" }); return; }
    if (paid && !sourceAccountCode) { toast({ variant: "destructive", title: "اختر مصدر الصرف للفاتورة المدفوعة" }); return; }
    if (!paid && sourceAccountCode) { toast({ variant: "destructive", title: "لا مصدر صرف في الفاتورة الآجلة" }); return; }
    if (!attachmentUrl) { toast({ variant: "destructive", title: "المرفق إلزامي — أرفق صورة فاتورة المورد" }); return; }
    try {
      await createMut.mutateAsync({
        supplierId: Number(supplierId),
        paid,
        sourceAccountCode: paid ? sourceAccountCode : undefined,
        invoiceNo: invoiceNo || undefined,
        invoiceDate: invoiceDate || undefined,
        dueDate: dueDate || undefined,
        description: description || undefined,
        branchId: branchId ? Number(branchId) : undefined,
        companyId: selectedCompanyIds.length === 1 ? Number(selectedCompanyIds[0]) : undefined,
        attachmentUrl: attachmentUrl || undefined,
        attachmentType: "invoice",
        lines: payloadLines,
      });
      toast({ title: "تم تسجيل فاتورة المورد بنجاح" });
      setLocation("/finance/expenses");
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: err?.message || "حدث خطأ أثناء تسجيل فاتورة المورد" });
    }
  };

  return (
    <CreatePageLayout title="فاتورة مورد جديدة" backPath="/finance/expenses" isDirty={lines.some((l) => l.itemName || l.accountPurpose) || !!supplierId}>
      <div data-form className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:items-start">
        {/* sticky attachment workspace (left in RTL), reuse the expense wiring. */}
        <aside className="mb-4 lg:mb-0 lg:order-2 lg:sticky lg:top-4">
          <FinancialAttachmentViewer
            mode="create"
            attachments={viewerAttachments}
            documentType="فاتورة"
            canReplace={canReplace}
            canDownload
            onUpload={applyAttachmentFile}
            onReplace={applyAttachmentFile}
            onRemove={clearAttachment}
          />
        </aside>

        <div className="min-w-0 lg:order-1">
          <ActiveContextNotice ctx={activeCtx} />

          {/* Header */}
          <div className="border rounded-lg p-4 mb-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">بيانات الفاتورة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SupplierSelect value={supplierId} onChange={setSupplierId} label="المورد" required />
              <BranchSelect value={branchId} onChange={setBranchId} label="الفرع" required autoSelectOwnBranch />
              <TextField label="رقم الفاتورة" value={invoiceNo} onChange={setInvoiceNo} placeholder="رقم فاتورة المورد" />
              <FormFieldWrapper label="تاريخ الفاتورة" required>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
              </FormFieldWrapper>
              <FormFieldWrapper label="تاريخ الاستحقاق">
                <DatePicker value={dueDate} onChange={setDueDate} />
              </FormFieldWrapper>
              <FormFieldWrapper label="حالة الدفع">
                <div className="flex items-center gap-2 h-10">
                  <Switch id="viPaid" checked={paid} onCheckedChange={setPaidToggle} />
                  <Label htmlFor="viPaid" className="text-sm">{paid ? "مدفوعة (نقدًا/تحويل)" : "آجلة (على ذمة المورد)"}</Label>
                  <span className={`ms-auto text-xs px-2 py-1 rounded ${paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {paid ? PAYMENT_STATUS_LABELS.paid : PAYMENT_STATUS_LABELS.unpaid}
                  </span>
                </div>
              </FormFieldWrapper>
              {/* paid → money source; credit → hidden + forbidden. */}
              {paid && (
                <FormFieldWrapper label="مصدر الصرف (الخزنة / البنك)" required>
                  <Autocomplete options={sourceOptions} value={sourceAccountCode}
                    onChange={(v) => setSourceAccountCode(String(v))} placeholder="ابحث عن مصدر صرف..." loading={accountsLoading} />
                </FormFieldWrapper>
              )}
            </div>
          </div>

          {/* Multi-line items */}
          <div className="border rounded-lg p-4 mb-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground">بنود الفاتورة</h3>
            {/* الجدول الموحّد للإدخالات المالية — المكوّن المشترك <LineItemsTable>
                بدل جدول HTML يدوي (نفس الأعمدة السبعة، منتقي صنف المورد + مركز
                التكلفة + لوحة الأبعاد عبر renderExpansion، إضافة/حذف بند). */}
            <LineItemsTable
              items={lines}
              minItems={1}
              onAdd={() => setLines((p) => [...p, emptyLine({ accountPurpose: supplierDefaults?.defaultAccountPurpose ?? "", costCenterId: supplierDefaults?.defaultCostCenterId != null ? String(supplierDefaults.defaultCostCenterId) : "" })])}
              onRemove={(i) => setLines((p) => p.filter((_, j) => j !== i))}
              addLabel="إضافة بند"
              columns={[
                {
                  header: "البند", className: "min-w-[10rem]",
                  render: (line, i) => (
                    <Input value={line.itemName} onChange={(e) => updateLine(i, { itemName: e.target.value })} placeholder="اسم البند" />
                  ),
                },
                {
                  header: "الكمية",
                  render: (line, i) => (
                    <Input type="number" step="0.01" className="w-20" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} placeholder="0" />
                  ),
                },
                {
                  header: "الوحدة",
                  render: (line, i) => (
                    <Input className="w-20" value={line.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} placeholder="قطعة" />
                  ),
                },
                {
                  header: "سعر الوحدة",
                  render: (line, i) => (
                    <Input type="number" step="0.01" className="w-24" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} placeholder="0.00" />
                  ),
                },
                {
                  header: "المبلغ", className: "whitespace-nowrap font-semibold text-emerald-700",
                  render: (line) => (lineAmount(line) ? formatCurrency(lineAmount(line)) : "—"),
                },
                {
                  header: "ضريبة البند",
                  render: (line, i) => (
                    <Input type="number" step="0.01" className="w-24" value={line.vatAmount} onChange={(e) => updateLine(i, { vatAmount: e.target.value })} placeholder="0.00" />
                  ),
                },
                {
                  header: "غرض الحساب *", className: "min-w-[9rem]",
                  render: (line, i) => (
                    <Select value={line.accountPurpose} onValueChange={(v) => updateLine(i, { accountPurpose: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="اختر الغرض" /></SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_PURPOSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ),
                },
              ]}
              renderExpansion={(line, i) => (
                <div className="space-y-2">
                  {/* supplier item picker (memory) — filtered by scenario. */}
                  {supplierId && (
                    <SupplierItemPicker
                      supplierId={supplierId}
                      scenario={line.scenario || undefined}
                      value={line.itemId != null ? String(line.itemId) : ""}
                      onPick={(item) => onPickItem(i, item)}
                    />
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <CostCenterSelect value={line.costCenterId} onChange={(v) => updateLine(i, { costCenterId: v })} label="مركز التكلفة" />
                    {/* البند ٤ — منتقٍ بدل النص الحر (الدستور: لا إدخال حر بحقل مرتبط
                        بكيان). رمز البند يحدّد حساب ضريبة المدخلات في المعالج. */}
                    <FormFieldWrapper label="رمز الضريبة">
                      <Select value={line.taxCode || "_none"} onValueChange={(v) => updateLine(i, { taxCode: v === "_none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="اختر رمز الضريبة..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— بدون —</SelectItem>
                          {taxCodes.map((t) => (
                            <SelectItem key={t.code} value={t.code}>
                              {t.code} ({Number(t.rate).toFixed(0)}%) — {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormFieldWrapper>
                  </div>
                  {/* per-line dimensions */}
                  <LineAllocationPanel
                    value={line.allocation}
                    onChange={(a) => updateLine(i, { allocation: a })}
                    status={deriveAllocationStatus(line.allocation)}
                    required={false}
                  />
                </div>
              )}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t">
              <span className="px-2 py-1 rounded bg-muted">صافي: <span className="font-mono">{formatCurrency(totalNet)}</span></span>
              {totalVat > 0 && <span className="px-2 py-1 rounded bg-status-info-surface text-status-info-foreground">ضريبة: <span className="font-mono">{formatCurrency(totalVat)}</span></span>}
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">الإجمالي: <span className="font-mono">{formatCurrency(totalWithVat)}</span></span>
            </div>
          </div>

          {/* البيان */}
          <div className="border rounded-lg p-4 mb-4 space-y-3">
            <TextField label="البيان" value={description} onChange={setDescription} placeholder="وصف فاتورة المورد (اختياري)" />
          </div>

          {/* Live journal preview — gates save on blockers. */}
          {previewReady && (
            <div className="mb-4">
              <LiveImpactPreview
                endpoint="/finance/vendor-invoices/impact-preview"
                enabled={previewReady}
                payload={{
                  supplierId: Number(supplierId),
                  paid,
                  sourceAccountCode: paid ? sourceAccountCode : undefined,
                  branchId: branchId ? Number(branchId) : undefined,
                  lines: buildLinePayload(),
                }}
                onResult={(r) => {
                  setJournalBlockers(r.journalPreview?.ready ? (r.journalPreview.blockers ?? []) : (r.journalPreview?.blockers ?? []));
                }}
              />
            </div>
          )}

          {journalBlockers.length > 0 && (
            <div className="mt-4 rounded-lg border border-status-error-surface bg-status-error-surface p-3 text-xs text-status-error-foreground">
              <p className="font-semibold mb-1">لا يمكن الحفظ — أصلِح القيد أولًا:</p>
              <ul className="list-disc pr-4 space-y-0.5">
                {journalBlockers.map((b, i) => <li key={i}>{b.message}</li>)}
              </ul>
            </div>
          )}

          {!attachmentUrl && (
            <div className="mt-4 flex items-center gap-2 text-xs text-status-error-foreground">
              <Paperclip className="h-4 w-4" /> المرفق إلزامي — أرفق صورة فاتورة المورد من اللوحة الجانبية.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
            <Button onClick={handleSubmit} rateLimitAware disabled={createMut.isPending || !activeCtx.ready || journalBlockers.length > 0}>
              {createMut.isPending ? "جاري الحفظ..." : "حفظ فاتورة المورد"}
            </Button>
          </div>
        </div>
      </div>
    </CreatePageLayout>
  );
}
