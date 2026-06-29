import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, NumberField } from "@/components/shared/form-field-wrapper";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { BranchSelect, PostingAccountSelect } from "@/components/shared/entity-selects";
import { roundMoney, formatCurrency , todayLocal } from "@/lib/formatters";
import { JOURNAL_TEMPLATES, type JournalTemplate } from "@/lib/journal-templates";

interface JournalLine {
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  costCenter?: string;
  departmentId?: string;
  projectId?: string;
  // Audit follow-through: journal-create only exposed 3 inline dim
  // fields, silently dropping 12 others the backend schema accepts.
  // Embed the shared LineAllocationPanel so every JE created via this
  // form can carry the full dim payload (vehicle / property / unit /
  // asset / contract / client / vendor / product / umrahAgent /
  // umrahSeason / activityType + manualOverrideReason).
  allocation?: LineAllocation;
}

const DRAFT_KEY = "finance_journal_create";
const INITIAL = { description: "", date: todayLocal(), branchId: "" };

export default function JournalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/journal", "POST", [["journal"]]);
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const departments = departmentsData?.data || [];
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const projects = projectsData?.data || [];

  const autoNumberRef = useRef(`JE-${Date.now().toString(36).toUpperCase()}`);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
  ]);


  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  // البند ٢/م٦ — تطبيق قالب جاهز (دُمج من journal-quick-templates): يملأ حسابات السطرين
  // ووصفهما + وصف القيد، ويترك المبالغ ليُدخلها المستخدم في الجدول. نفس ترحيل
  // /finance/journal بلا دورة جديدة — مجرّد تعبئة مسبقة للقيود الشائعة.
  const applyTemplate = (t: JournalTemplate) => {
    setForm((f) => ({ ...f, description: t.defaultDescription }));
    setLines(
      t.lines.map((l) => ({
        accountCode: l.defaultAccountCode ?? "",
        description: l.label,
        debit: "", credit: "",
        costCenter: "", departmentId: "", projectId: "",
      })),
    );
  };

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async () => {
    const validLines = lines.filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0));
    const firstError = validate({
      balance: !isBalanced ? "القيد غير متوازن - يجب أن يتساوى المدين والدائن" : null,
      lines: validLines.length < 2 ? "يجب إدخال بندين على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        ref: autoNumberRef.current,
        description: form.description,
        // Operator's explicit branch pick. Required for multi-branch
        // users (backend returns BRANCH_REQUIRED if missing). Single-
        // branch users auto-derive from scope.
        branchId: form.branchId ? Number(form.branchId) : undefined,
        lines: validLines.map(l => ({
          accountCode: l.accountCode,
          description: l.description,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          costCenter: l.costCenter || undefined,
          departmentId: l.departmentId ? Number(l.departmentId) : undefined,
          projectId: l.projectId ? Number(l.projectId) : undefined,
          // Spread the LineAllocationPanel's dim payload so the line
          // carries vehicleId / propertyId / unitId / assetId /
          // contractId / clientId / vendorId / productId / driverId
          // / umrahAgentId / umrahSeasonId / activityType +
          // optional manualOverrideReason. The backend schema at
          // routes/finance-accounts.ts:41 already accepts every
          // field; only the form was dropping them.
          ...buildAllocationPayload(l.allocation ?? {}),
        })),
      });
      clearDraft();
      toast({ title: "تم إضافة القيد بنجاح" });
      setLocation("/finance/journal");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة القيد", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="قيد يومية جديد" backPath="/finance/journal">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      {/* البند ٢/م٦ — منتقي القوالب الجاهزة (دُمج من journal-quick-templates المُحوَّلة
          بـredirect): يملأ قيدًا شائعًا (الحسابات + الوصف) ثم يُدخل المستخدم المبالغ. */}
      <div className="mb-5">
        <Label className="text-sm font-medium mb-1.5 block">قالب جاهز (اختياري)</Label>
        <Select
          value=""
          onValueChange={(id) => {
            const t = JOURNAL_TEMPLATES.find((x) => x.id === id);
            if (t) applyTemplate(t);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر قالبًا لقيد شائع (إهلاك، استحقاق، عمولة…) لتعبئة سريعة" />
          </SelectTrigger>
          <SelectContent>
            {JOURNAL_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name} — {t.category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* #1715 review — the JE number is assigned by the server on save (it
            ignores any client ref), so don't show a fake JE-… that won't match. */}
        <AutoField label="رقم القيد" value="يُحدَّد تلقائيًا عند الحفظ" />
        <CreationDateField />
        <BranchSelect
          value={form.branchId ?? ""}
          onChange={(v) => setForm((f) => ({ ...f, branchId: String(v ?? "") }))}
          label="الفرع"
          allowCreate={false}
          autoSelectOwnBranch
        />
        <TextField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} className="md:col-span-2" />
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <h3 className="font-semibold mb-3">بنود القيد</h3>
          {/* الجدول الموحّد للإدخالات المالية — المكوّن المشترك <LineItemsTable>
              بدل شبكة CSS يدوية (الحساب/البيان/مدين/دائن أعمدة؛ أبعاد السطر
              (مركز تكلفة/قسم/مشروع) + لوحة الأبعاد الكاملة عبر renderExpansion؛
              صف الإجمالي عبر renderTotals). */}
          <LineItemsTable
            items={lines}
            minItems={2}
            onAdd={addLine}
            onRemove={removeLine}
            addLabel="إضافة بند"
            columns={[
              {
                header: "الحساب",
                render: (line, idx) => (
                  <PostingAccountSelect
                    value={line.accountCode}
                    onChange={(v) => updateLine(idx, "accountCode", v)}
                    label="" allowCreate={false}
                  />
                ),
              },
              {
                header: "البيان",
                render: (line, idx) => (
                  <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="وصف البند" />
                ),
              },
              {
                header: "مدين", width: "120px",
                render: (line, idx) => (
                  <NumberField label="مدين" hideLabel value={line.debit} onChange={(v) => updateLine(idx, "debit", v)} placeholder="0" />
                ),
              },
              {
                header: "دائن", width: "120px",
                render: (line, idx) => (
                  <NumberField label="دائن" hideLabel value={line.credit} onChange={(v) => updateLine(idx, "credit", v)} placeholder="0" />
                ),
              },
            ]}
            renderExpansion={(line, idx) => (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-2 ps-1">
                  <Input
                    className="h-8 text-xs"
                    value={line.costCenter || ""}
                    onChange={(e) => updateLine(idx, "costCenter", e.target.value)}
                    placeholder="مركز التكلفة (اختياري)"
                  />
                  <Select value={line.departmentId || "_none"} onValueChange={(v) => updateLine(idx, "departmentId", v === "_none" ? "" : v)}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="القسم (اختياري)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون قسم</SelectItem>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={line.projectId || "_none"} onValueChange={(v) => updateLine(idx, "projectId", v === "_none" ? "" : v)}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="المشروع (اختياري)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون مشروع</SelectItem>
                      {projects.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name || p.title || `مشروع #${p.id}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Full dim-allocation panel — exposes vehicle/property/
                    unit/asset/contract/client/vendor/product/driver/
                    umrahAgent/umrahSeason/activityType + optional
                    manualOverrideReason so the line can carry the same
                    drilldowns as invoice/PO/expense JE lines. */}
                <LineAllocationPanel
                  value={line.allocation ?? {}}
                  onChange={(next) => updateLine(idx, "allocation" as any, next as any)}
                  status={deriveAllocationStatus(line.allocation ?? {})}
                  required={false}
                />
              </div>
            )}
            renderTotals={() => (
              <tr className="bg-surface-subtle font-semibold border-t text-sm">
                <td></td>
                <td className="px-3 py-2">الإجمالي</td>
                <td className="px-3 py-2">{formatCurrency(totalDebit)}</td>
                <td className="px-3 py-2">{formatCurrency(totalCredit)}</td>
                <td></td>
              </tr>
            )}
            footer={!isBalanced && totalDebit > 0 ? (
              <p className="text-destructive text-sm">القيد غير متوازن — المدين يجب أن يساوي الدائن</p>
            ) : undefined}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/journal")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
