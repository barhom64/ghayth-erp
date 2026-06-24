import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageShell, DataTable } from "@workspace/ui-core";
import { ArrowLeft, Plus, Pencil, Trash2, Fuel, Wrench, AlertTriangle, Clipboard } from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

// #1733 follow-up — admin SPA for the two rules engines created in
// migration 269 (PR #1796). Both engines previously had no admin surface
// so rules could only be inserted via SQL. This page closes that gap.
//
//   Tab 1 — Expense rules (fleet_expense_rules):
//     Defaults the 3-bucket accounting treatment + liability + recharge
//     on fuel logs / maintenance work-orders / traffic violations.
//
//   Tab 2 — Intake rules (transport_intake_rules):
//     Drives required-vehicle / required-license / cost-center defaults
//     on booking, dispatch, and service-line intake. (Comment 6 explicitly
//     walked back expenses from intake — intake is OPERATIONS only.)

const EXPENSE_SOURCES = [
  { value: "fuel_log", label: "وقود", icon: Fuel },
  { value: "maintenance", label: "صيانة", icon: Wrench },
  { value: "traffic_violation", label: "مخالفة مرورية", icon: AlertTriangle },
] as const;

const ACCOUNTING_TREATMENTS = [
  { value: "direct_expense", label: "مصروف مباشر" },
  { value: "capitalized_asset_improvement", label: "تحسين أصل (رأسمالي)" },
  { value: "deferred_expense", label: "مصروف مؤجَّل" },
] as const;

const LIABILITY_PARTIES = [
  { value: "company", label: "الشركة" },
  { value: "driver", label: "السائق" },
  { value: "customer", label: "العميل" },
  { value: "third_party", label: "طرف ثالث" },
  { value: "insurance", label: "التأمين" },
  { value: "unknown", label: "غير معروف" },
] as const;

const OPERATION_TYPES = [
  { value: "booking", label: "حجز" },
  { value: "dispatch", label: "أمر توزيع" },
  { value: "service_line", label: "بند خدمة" },
] as const;

const SERVICE_TYPES = [
  { value: "cargo_load", label: "نقل حمولة" },
  { value: "passenger_umrah", label: "نقل معتمرين" },
  { value: "passenger_general", label: "نقل ركاب" },
  { value: "equipment_rental", label: "تأجير معدة" },
  { value: "internal_transfer", label: "نقل داخلي" },
  { value: "other", label: "أخرى" },
] as const;

interface ExpenseRule {
  id: number;
  ruleName: string;
  expenseSource: string;
  vehicleId: number | null;
  vehicleType: string | null;
  stationName: string | null;
  maintenanceType: string | null;
  violationType: string | null;
  defaultAccountingTreatment: string | null;
  defaultRechargeable: boolean;
  defaultLiabilityParty: string | null;
  defaultCostCenterId: number | null;
  requiresApproval: boolean;
  priority: number;
  notes: string | null;
  isActive: boolean;
}

interface IntakeRule {
  id: number;
  ruleName: string;
  operationType: string;
  transportServiceType: string;
  customerId: number | null;
  bookingSource: string | null;
  requiredVehicleType: string | null;
  requiredLicenseClass: string | null;
  defaultCostCenterId: number | null;
  requiresAttachment: boolean;
  requiresApproval: boolean;
  createsBookingDraft: boolean;
  createsBillingCandidate: boolean;
  priority: number;
  notes: string | null;
  isActive: boolean;
}

function expenseSourceLabel(v: string): string {
  return EXPENSE_SOURCES.find((s) => s.value === v)?.label ?? v;
}

function treatmentLabel(v: string | null): string {
  if (!v) return "—";
  return ACCOUNTING_TREATMENTS.find((t) => t.value === v)?.label ?? v;
}

function liabilityLabel(v: string | null): string {
  if (!v) return "—";
  return LIABILITY_PARTIES.find((l) => l.value === v)?.label ?? v;
}

function opTypeLabel(v: string): string {
  return OPERATION_TYPES.find((o) => o.value === v)?.label ?? v;
}

function serviceLabel(v: string): string {
  return SERVICE_TYPES.find((s) => s.value === v)?.label ?? v;
}

// ──────────────────────── Expense rules sub-page ─────────────────────

interface ExpenseFormState {
  id?: number;
  ruleName: string;
  expenseSource: string;
  vehicleId: string;
  vehicleType: string;
  stationName: string;
  maintenanceType: string;
  violationType: string;
  defaultAccountingTreatment: string;
  defaultRechargeable: boolean;
  defaultLiabilityParty: string;
  defaultCostCenterId: string;
  requiresApproval: boolean;
  priority: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_EXPENSE: ExpenseFormState = {
  ruleName: "",
  expenseSource: "fuel_log",
  vehicleId: "",
  vehicleType: "",
  stationName: "",
  maintenanceType: "",
  violationType: "",
  defaultAccountingTreatment: "direct_expense",
  defaultRechargeable: false,
  defaultLiabilityParty: "",
  defaultCostCenterId: "",
  requiresApproval: false,
  priority: "0",
  notes: "",
  isActive: true,
};

function ExpenseRulesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_EXPENSE);
  const [submitting, setSubmitting] = useState(false);

  const qs = sourceFilter === "all" ? "" : `?source=${sourceFilter}`;
  const { data, isLoading, refetch } = useApiQuery<{ data: ExpenseRule[] }>(
    ["fleet-expense-rules", sourceFilter],
    `/fleet/expense-rules${qs}`,
  );
  const rules = data?.data ?? [];
  const visible = useMemo(
    () => rules.slice().sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id - b.id;
    }),
    [rules],
  );

  const openCreate = () => { setForm(EMPTY_EXPENSE); setDialogOpen(true); };
  const openEdit = (r: ExpenseRule) => {
    setForm({
      id: r.id,
      ruleName: r.ruleName,
      expenseSource: r.expenseSource,
      vehicleId: r.vehicleId != null ? String(r.vehicleId) : "",
      vehicleType: r.vehicleType ?? "",
      stationName: r.stationName ?? "",
      maintenanceType: r.maintenanceType ?? "",
      violationType: r.violationType ?? "",
      defaultAccountingTreatment: r.defaultAccountingTreatment ?? "",
      defaultRechargeable: r.defaultRechargeable,
      defaultLiabilityParty: r.defaultLiabilityParty ?? "",
      defaultCostCenterId: r.defaultCostCenterId != null ? String(r.defaultCostCenterId) : "",
      requiresApproval: r.requiresApproval,
      priority: String(r.priority ?? 0),
      notes: r.notes ?? "",
      isActive: r.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.ruleName.trim()) {
      toast({ variant: "destructive", title: "اسم القاعدة مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        ruleName: form.ruleName.trim(),
        expenseSource: form.expenseSource,
        defaultRechargeable: form.defaultRechargeable,
        requiresApproval: form.requiresApproval,
        priority: Number(form.priority || "0"),
      };
      if (form.vehicleId) body.vehicleId = Number(form.vehicleId);
      if (form.vehicleType.trim()) body.vehicleType = form.vehicleType.trim();
      if (form.stationName.trim()) body.stationName = form.stationName.trim();
      if (form.maintenanceType.trim()) body.maintenanceType = form.maintenanceType.trim();
      if (form.violationType.trim()) body.violationType = form.violationType.trim();
      if (form.defaultAccountingTreatment) body.defaultAccountingTreatment = form.defaultAccountingTreatment;
      if (form.defaultLiabilityParty) body.defaultLiabilityParty = form.defaultLiabilityParty;
      if (form.defaultCostCenterId) body.defaultCostCenterId = Number(form.defaultCostCenterId);
      if (form.notes.trim()) body.notes = form.notes.trim();
      if (form.id != null) body.isActive = form.isActive;

      if (form.id != null) {
        await apiFetch(`/fleet/expense-rules/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast({ title: "تم تحديث القاعدة" });
      } else {
        await apiFetch("/fleet/expense-rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast({ title: "تم إنشاء القاعدة" });
      }
      qc.invalidateQueries({ queryKey: ["fleet-expense-rules", sourceFilter] });
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (r: ExpenseRule) => {
    if (!confirm(`حذف القاعدة "${r.ruleName}"؟`)) return;
    try {
      await apiFetch(`/fleet/expense-rules/${r.id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      qc.invalidateQueries({ queryKey: ["fleet-expense-rules", sourceFilter] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحذف", description: message });
    }
  };

  const toggleActive = async (r: ExpenseRule) => {
    try {
      await apiFetch(`/fleet/expense-rules/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      qc.invalidateQueries({ queryKey: ["fleet-expense-rules", sourceFilter] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التحديث", description: message });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Label className="text-xs text-muted-foreground">المصدر</Label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                {EXPENSE_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <Button size="sm" onClick={openCreate} className="ms-auto" rateLimitAware>
              <Plus className="h-4 w-4 me-1" />قاعدة جديدة
            </Button>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد قواعد تصنيف نفقات. أنشئ قواعد لتطبيق الافتراضات تلقائياً على
              سجلات الوقود والصيانة والمخالفات.
            </div>
          ) : (
            <DataTable<(typeof visible)[number]>
              noToolbar
              pageSize={0}
              data={visible}
              rowKey={(r) => r.id}
              columns={[
                { key: "ruleName", header: "الاسم", sortable: false, className: "font-medium", render: (r) => r.ruleName },
                { key: "source", header: "المصدر", sortable: false, render: (r) => expenseSourceLabel(r.expenseSource) },
                {
                  key: "criteria", header: "معايير المطابقة", sortable: false, className: "text-xs space-y-0.5",
                  render: (r) => (
                    <>
                      {r.vehicleId != null && <div>المركبة #{r.vehicleId}</div>}
                      {r.vehicleType && <div>النوع: {r.vehicleType}</div>}
                      {r.stationName && <div>المحطة: {r.stationName}</div>}
                      {r.maintenanceType && <div>صيانة: {r.maintenanceType}</div>}
                      {r.violationType && <div>مخالفة: {r.violationType}</div>}
                      {!r.vehicleId && !r.vehicleType && !r.stationName && !r.maintenanceType && !r.violationType && (
                        <span className="text-muted-foreground">قاعدة عامة</span>
                      )}
                    </>
                  ),
                },
                { key: "treatment", header: "المعالجة", sortable: false, render: (r) => treatmentLabel(r.defaultAccountingTreatment) },
                {
                  key: "rechargeable", header: "إعادة تحميل", sortable: false,
                  render: (r) => (r.defaultRechargeable ? <Badge className="bg-purple-50 text-purple-700">نعم</Badge> : <span className="text-muted-foreground text-xs">—</span>),
                },
                { key: "liability", header: "المسؤولية", sortable: false, render: (r) => liabilityLabel(r.defaultLiabilityParty) },
                { key: "priority", header: "الأولوية", sortable: false, className: "font-mono", render: (r) => r.priority },
                { key: "status", header: "الحالة", sortable: false, render: (r) => <Switch checked={r.isActive} onCheckedChange={() => toggleActive(r)} /> },
                {
                  key: "_actions", header: "", sortable: false,
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(r)} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id != null ? "تعديل قاعدة تصنيف" : "قاعدة تصنيف نفقات جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>اسم القاعدة *</Label>
                <Input value={form.ruleName}
                  onChange={(e) => setForm({ ...form, ruleName: e.target.value })} />
              </div>
              <div>
                <Label>المصدر *</Label>
                <Select value={form.expenseSource}
                  onValueChange={(v) => setForm({ ...form, expenseSource: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المركبة (id — اختياري)</Label>
                <Input type="number" value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} />
              </div>
              <div>
                <Label>نوع المركبة</Label>
                <Input value={form.vehicleType}
                  onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                  placeholder="truck / van / bus …" />
              </div>
              {form.expenseSource === "fuel_log" && (
                <div>
                  <Label>اسم المحطة</Label>
                  <Input value={form.stationName}
                    onChange={(e) => setForm({ ...form, stationName: e.target.value })} />
                </div>
              )}
              {form.expenseSource === "maintenance" && (
                <div>
                  <Label>نوع الصيانة</Label>
                  <Input value={form.maintenanceType}
                    onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })} />
                </div>
              )}
              {form.expenseSource === "traffic_violation" && (
                <div>
                  <Label>نوع المخالفة</Label>
                  <Input value={form.violationType}
                    onChange={(e) => setForm({ ...form, violationType: e.target.value })} />
                </div>
              )}
              <div>
                <Label>معالجة محاسبية افتراضية</Label>
                <Select value={form.defaultAccountingTreatment || "__none__"}
                  onValueChange={(v) => setForm({ ...form, defaultAccountingTreatment: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون افتراض —</SelectItem>
                    {ACCOUNTING_TREATMENTS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>طرف المسؤولية الافتراضي</Label>
                <Select value={form.defaultLiabilityParty || "__none__"}
                  onValueChange={(v) => setForm({ ...form, defaultLiabilityParty: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون افتراض —</SelectItem>
                    {LIABILITY_PARTIES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>مركز التكلفة الافتراضي (id)</Label>
                <Input type="number" value={form.defaultCostCenterId}
                  onChange={(e) => setForm({ ...form, defaultCostCenterId: e.target.value })} />
              </div>
              <div>
                <Label>الأولوية</Label>
                <Input type="number" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.defaultRechargeable}
                  onCheckedChange={(v) => setForm({ ...form, defaultRechargeable: v })} />
                <Label className="cursor-pointer">إعادة تحميل على العميل افتراضياً</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.requiresApproval}
                  onCheckedChange={(v) => setForm({ ...form, requiresApproval: v })} />
                <Label className="cursor-pointer">تتطلب اعتماداً</Label>
              </div>
              <div className="md:col-span-2">
                <Label>ملاحظات</Label>
                <Textarea value={form.notes} rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={submitting} rateLimitAware>
              {submitting ? "جاري الحفظ…" : form.id != null ? "حفظ التعديلات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ──────────────────────── Intake rules sub-page ──────────────────────

interface IntakeFormState {
  id?: number;
  ruleName: string;
  operationType: string;
  transportServiceType: string;
  customerId: string;
  bookingSource: string;
  requiredVehicleType: string;
  requiredLicenseClass: string;
  defaultCostCenterId: string;
  requiresAttachment: boolean;
  requiresApproval: boolean;
  createsBookingDraft: boolean;
  createsBillingCandidate: boolean;
  priority: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_INTAKE: IntakeFormState = {
  ruleName: "",
  operationType: "booking",
  transportServiceType: "cargo_load",
  customerId: "",
  bookingSource: "",
  requiredVehicleType: "",
  requiredLicenseClass: "",
  defaultCostCenterId: "",
  requiresAttachment: false,
  requiresApproval: false,
  createsBookingDraft: false,
  createsBillingCandidate: false,
  priority: "0",
  notes: "",
  isActive: true,
};

function IntakeRulesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [opFilter, setOpFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<IntakeFormState>(EMPTY_INTAKE);
  const [submitting, setSubmitting] = useState(false);

  const qsParts: string[] = [];
  if (opFilter !== "all") qsParts.push(`operationType=${opFilter}`);
  if (serviceFilter !== "all") qsParts.push(`serviceType=${serviceFilter}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, refetch } = useApiQuery<{ data: IntakeRule[] }>(
    ["transport-intake-rules", opFilter, serviceFilter],
    `/transport/intake-rules${qs}`,
  );
  const rules = data?.data ?? [];
  const visible = useMemo(
    () => rules.slice().sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id - b.id;
    }),
    [rules],
  );

  const queryKey = ["transport-intake-rules", opFilter, serviceFilter];

  const openCreate = () => { setForm(EMPTY_INTAKE); setDialogOpen(true); };
  const openEdit = (r: IntakeRule) => {
    setForm({
      id: r.id,
      ruleName: r.ruleName,
      operationType: r.operationType,
      transportServiceType: r.transportServiceType,
      customerId: r.customerId != null ? String(r.customerId) : "",
      bookingSource: r.bookingSource ?? "",
      requiredVehicleType: r.requiredVehicleType ?? "",
      requiredLicenseClass: r.requiredLicenseClass ?? "",
      defaultCostCenterId: r.defaultCostCenterId != null ? String(r.defaultCostCenterId) : "",
      requiresAttachment: r.requiresAttachment,
      requiresApproval: r.requiresApproval,
      createsBookingDraft: r.createsBookingDraft,
      createsBillingCandidate: r.createsBillingCandidate,
      priority: String(r.priority ?? 0),
      notes: r.notes ?? "",
      isActive: r.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.ruleName.trim()) {
      toast({ variant: "destructive", title: "اسم القاعدة مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        ruleName: form.ruleName.trim(),
        operationType: form.operationType,
        transportServiceType: form.transportServiceType,
        requiresAttachment: form.requiresAttachment,
        requiresApproval: form.requiresApproval,
        createsBookingDraft: form.createsBookingDraft,
        createsBillingCandidate: form.createsBillingCandidate,
        priority: Number(form.priority || "0"),
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      if (form.bookingSource.trim()) body.bookingSource = form.bookingSource.trim();
      if (form.requiredVehicleType.trim()) body.requiredVehicleType = form.requiredVehicleType.trim();
      if (form.requiredLicenseClass.trim()) body.requiredLicenseClass = form.requiredLicenseClass.trim();
      if (form.defaultCostCenterId) body.defaultCostCenterId = Number(form.defaultCostCenterId);
      if (form.notes.trim()) body.notes = form.notes.trim();
      if (form.id != null) body.isActive = form.isActive;

      if (form.id != null) {
        await apiFetch(`/transport/intake-rules/${form.id}`, {
          method: "PATCH", body: JSON.stringify(body),
        });
        toast({ title: "تم تحديث القاعدة" });
      } else {
        await apiFetch("/transport/intake-rules", {
          method: "POST", body: JSON.stringify(body),
        });
        toast({ title: "تم إنشاء القاعدة" });
      }
      qc.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (r: IntakeRule) => {
    if (!confirm(`حذف القاعدة "${r.ruleName}"؟`)) return;
    try {
      await apiFetch(`/transport/intake-rules/${r.id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      qc.invalidateQueries({ queryKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الحذف", description: message });
    }
  };

  const toggleActive = async (r: IntakeRule) => {
    try {
      await apiFetch(`/transport/intake-rules/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      qc.invalidateQueries({ queryKey });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التحديث", description: message });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Label className="text-xs text-muted-foreground">العملية</Label>
            <Select value={opFilter} onValueChange={setOpFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العمليات</SelectItem>
                {OPERATION_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs text-muted-foreground">نوع الخدمة</Label>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <Button size="sm" onClick={openCreate} className="ms-auto" rateLimitAware>
              <Plus className="h-4 w-4 me-1" />قاعدة جديدة
            </Button>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد قواعد استقبال. أنشئ قواعد لتطبيق متطلبات التوثيق + المركبة +
              مركز التكلفة الافتراضية على شاشات الإدخال.
            </div>
          ) : (
            <DataTable<(typeof visible)[number]>
              noToolbar
              pageSize={0}
              data={visible}
              rowKey={(r) => r.id}
              columns={[
                { key: "ruleName", header: "الاسم", sortable: false, className: "font-medium", render: (r) => r.ruleName },
                { key: "operation", header: "العملية", sortable: false, render: (r) => opTypeLabel(r.operationType) },
                { key: "service", header: "نوع الخدمة", sortable: false, render: (r) => serviceLabel(r.transportServiceType) },
                {
                  key: "criteria", header: "معايير المطابقة", sortable: false, className: "text-xs space-y-0.5",
                  render: (r) => (
                    <>
                      {r.customerId != null && <div>العميل #{r.customerId}</div>}
                      {r.bookingSource && <div>المصدر: {r.bookingSource}</div>}
                      {!r.customerId && !r.bookingSource && (
                        <span className="text-muted-foreground">قاعدة عامة</span>
                      )}
                    </>
                  ),
                },
                {
                  key: "defaults", header: "الافتراضات", sortable: false, className: "text-xs space-y-0.5",
                  render: (r) => (
                    <>
                      {r.requiredVehicleType && <div>مركبة: {r.requiredVehicleType}</div>}
                      {r.requiredLicenseClass && <div>رخصة: {r.requiredLicenseClass}</div>}
                      {r.defaultCostCenterId != null && <div>مركز تكلفة #{r.defaultCostCenterId}</div>}
                      {r.requiresAttachment && <Badge variant="outline" className="text-[10px]">مرفق إلزامي</Badge>}
                      {r.requiresApproval && <Badge variant="outline" className="text-[10px]">اعتماد</Badge>}
                      {r.createsBookingDraft && <Badge variant="outline" className="text-[10px]">يفتح مسودة حجز</Badge>}
                      {r.createsBillingCandidate && <Badge variant="outline" className="text-[10px] bg-purple-50">يولّد أثراً محاسبياً</Badge>}
                    </>
                  ),
                },
                { key: "priority", header: "الأولوية", sortable: false, className: "font-mono", render: (r) => r.priority },
                { key: "status", header: "الحالة", sortable: false, render: (r) => <Switch checked={r.isActive} onCheckedChange={() => toggleActive(r)} /> },
                {
                  key: "_actions", header: "", sortable: false,
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(r)} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id != null ? "تعديل قاعدة استقبال" : "قاعدة استقبال جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>اسم القاعدة *</Label>
                <Input value={form.ruleName}
                  onChange={(e) => setForm({ ...form, ruleName: e.target.value })} />
              </div>
              <div>
                <Label>نوع العملية *</Label>
                <Select value={form.operationType}
                  onValueChange={(v) => setForm({ ...form, operationType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATION_TYPES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع الخدمة *</Label>
                <Select value={form.transportServiceType}
                  onValueChange={(v) => setForm({ ...form, transportServiceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>العميل (id — اختياري)</Label>
                <Input type="number" value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })} />
              </div>
              <div>
                <Label>مصدر الحجز</Label>
                <Input value={form.bookingSource}
                  onChange={(e) => setForm({ ...form, bookingSource: e.target.value })}
                  placeholder="manual_entry / customer_request / …" />
              </div>
              <div>
                <Label>نوع المركبة المطلوب</Label>
                <Input value={form.requiredVehicleType}
                  onChange={(e) => setForm({ ...form, requiredVehicleType: e.target.value })} />
              </div>
              <div>
                <Label>صنف الرخصة المطلوب</Label>
                <Input value={form.requiredLicenseClass}
                  onChange={(e) => setForm({ ...form, requiredLicenseClass: e.target.value })} />
              </div>
              <div>
                <Label>مركز التكلفة الافتراضي (id)</Label>
                <Input type="number" value={form.defaultCostCenterId}
                  onChange={(e) => setForm({ ...form, defaultCostCenterId: e.target.value })} />
              </div>
              <div>
                <Label>الأولوية</Label>
                <Input type="number" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.requiresAttachment}
                  onCheckedChange={(v) => setForm({ ...form, requiresAttachment: v })} />
                <Label className="cursor-pointer">يتطلب مرفقاً</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.requiresApproval}
                  onCheckedChange={(v) => setForm({ ...form, requiresApproval: v })} />
                <Label className="cursor-pointer">يتطلب اعتماداً</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.createsBookingDraft}
                  onCheckedChange={(v) => setForm({ ...form, createsBookingDraft: v })} />
                <Label className="cursor-pointer">يفتح مسودة حجز تلقائياً</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.createsBillingCandidate}
                  onCheckedChange={(v) => setForm({ ...form, createsBillingCandidate: v })} />
                <Label className="cursor-pointer">يولّد أثراً محاسبياً (بعد الإغلاق)</Label>
              </div>
              <div className="md:col-span-2">
                <Label>ملاحظات</Label>
                <Textarea value={form.notes} rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={submitting} rateLimitAware>
              {submitting ? "جاري الحفظ…" : form.id != null ? "حفظ التعديلات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ────────────────────────────── Planning settings ─────────────────────

// #1812 Maps Provider Adapter (owner brief 2026-06-15) — the UI lists
// only the three providers the backend accepts end-to-end. `mapbox` +
// `here_maps` were removed because they fall through to manual on the
// server, so picking them silently produced manual estimates while
// the operator thought they'd activated a real provider. `auto` is
// the operator-friendly default: Google if a key is configured, else
// internal estimate.
const MAP_PROVIDERS_UI = [
  { value: "auto",        label: "تلقائي — Google إذا توفّر المفتاح، وإلا تقدير داخلي" },
  { value: "google_maps", label: "Google Maps فقط" },
  { value: "manual_only", label: "تقدير داخلي فقط (بدون Google)" },
];

function PlanningSettingsPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<any>(["transport-planning-settings"], "/transport/planning-settings");
  const s = data?.data || data || {};
  const [form, setForm] = useState<Record<string, string>>({});
  const [enableExternalNav, setEnableExternalNav] = useState<boolean>(true);
  const [newApiKey, setNewApiKey] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  if (!isLoading && !loaded) {
    setForm({
      mapProvider: s.mapProvider || "auto",
      defaultRestHoursRequired: String(s.defaultRestHoursRequired ?? ""),
      defaultLoadingMinutes: String(s.defaultLoadingMinutes ?? ""),
      defaultUnloadingMinutes: String(s.defaultUnloadingMinutes ?? ""),
      defaultBufferMinutes: String(s.defaultBufferMinutes ?? ""),
      defaultDeadheadKmh: String(s.defaultDeadheadKmh ?? ""),
      estimateCacheTtlMinutes: String(s.estimateCacheTtlMinutes ?? ""),
    });
    setEnableExternalNav(s.enableExternalNavigationUrls !== false);
    setLoaded(true);
  }

  const save = async () => {
    try {
      const payload: Record<string, unknown> = {
        mapProvider: form.mapProvider || undefined,
        defaultRestHoursRequired: form.defaultRestHoursRequired ? Number(form.defaultRestHoursRequired) : undefined,
        defaultLoadingMinutes: form.defaultLoadingMinutes ? Number(form.defaultLoadingMinutes) : undefined,
        defaultUnloadingMinutes: form.defaultUnloadingMinutes ? Number(form.defaultUnloadingMinutes) : undefined,
        defaultBufferMinutes: form.defaultBufferMinutes ? Number(form.defaultBufferMinutes) : undefined,
        defaultDeadheadKmh: form.defaultDeadheadKmh ? Number(form.defaultDeadheadKmh) : undefined,
        estimateCacheTtlMinutes: form.estimateCacheTtlMinutes ? Number(form.estimateCacheTtlMinutes) : undefined,
        enableExternalNavigationUrls: enableExternalNav,
      };
      // Only send the API key when the operator typed a new one. An
      // empty input means "leave the saved value alone"; the special
      // sentinel `__clear__` is the explicit "remove the saved key".
      if (newApiKey === "__clear__") payload.mapProviderApiKey = null;
      else if (newApiKey.trim().length > 0) payload.mapProviderApiKey = newApiKey.trim();

      await apiFetch("/transport/planning-settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم حفظ الإعدادات" });
      setNewApiKey("");
      setLoaded(false);
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: err?.message });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const usingFallback = Boolean(s.usingFallback);
  const fallbackNotice = s.fallbackNoticeAr as string | null;
  const keyConfigured = Boolean(s.mapProviderApiKeyConfigured);
  const maskedKey = s.mapProviderApiKey as string | null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">إعدادات تخطيط النقل</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {usingFallback && fallbackNotice && (
          <div
            data-testid="maps-fallback-notice"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <span className="inline-block ms-1 align-middle">⚠️</span>
            {fallbackNotice}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>مزوّد الخريطة</Label>
            <select className="w-full h-10 border rounded-md px-2 mt-1" value={form.mapProvider || "auto"}
              onChange={(e) => setForm((f) => ({ ...f, mapProvider: e.target.value }))}>
              {MAP_PROVIDERS_UI.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <div className="text-xs text-muted-foreground mt-1">
              المزوّد الفعّال حالياً: <span className="font-mono">{s.effectiveProvider || "manual_only"}</span>
              {" · "}دقة التقدير: <span className="font-mono">{s.routingPrecision || "estimated"}</span>
            </div>
          </div>

          <div className="col-span-2">
            <Label>مفتاح Google Maps API</Label>
            <Input
              type="password"
              autoComplete="off"
              className="mt-1"
              placeholder={keyConfigured && maskedKey ? `محفوظ — ${maskedKey}` : "ألصق المفتاح هنا لتفعيل Google Maps"}
              value={newApiKey === "__clear__" ? "" : newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
            />
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
              <span>
                {keyConfigured
                  ? "مفتاح محفوظ على الخادم — لن يُعرض النص الكامل أبداً."
                  : "لا يوجد مفتاح. النظام يعمل بوضع التقدير الداخلي."}
              </span>
              {keyConfigured && (
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => setNewApiKey("__clear__")}
                >
                  حذف المفتاح المحفوظ
                </button>
              )}
            </div>
          </div>

          <div className="col-span-2 flex items-center justify-between border rounded-md p-3">
            <div>
              <Label className="block">السماح بفتح خرائط Google خارج التطبيق للملاحة</Label>
              <div className="text-xs text-muted-foreground mt-1">
                زر «ابدأ الملاحة» على شاشة السائق يفتح خرائط Google بدون الحاجة لمفتاح API.
              </div>
            </div>
            <Switch checked={enableExternalNav} onCheckedChange={setEnableExternalNav} />
          </div>

          <div>
            <Label>ساعات الراحة المطلوبة (افتراضي)</Label>
            <Input type="number" className="mt-1" value={form.defaultRestHoursRequired || ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultRestHoursRequired: e.target.value }))} />
          </div>
          <div>
            <Label>دقائق الشحن (افتراضي)</Label>
            <Input type="number" className="mt-1" value={form.defaultLoadingMinutes || ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultLoadingMinutes: e.target.value }))} />
          </div>
          <div>
            <Label>دقائق التفريغ (افتراضي)</Label>
            <Input type="number" className="mt-1" value={form.defaultUnloadingMinutes || ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultUnloadingMinutes: e.target.value }))} />
          </div>
          <div>
            <Label>دقائق الاحتياطي (افتراضي)</Label>
            <Input type="number" className="mt-1" value={form.defaultBufferMinutes || ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultBufferMinutes: e.target.value }))} />
          </div>
          <div>
            <Label>سرعة العودة الفارغة (كم/ساعة)</Label>
            <Input type="number" className="mt-1" value={form.defaultDeadheadKmh || ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultDeadheadKmh: e.target.value }))} />
          </div>
          <div>
            <Label>صلاحية كاش التقدير (دقائق)</Label>
            <Input type="number" className="mt-1" value={form.estimateCacheTtlMinutes || ""}
              onChange={(e) => setForm((f) => ({ ...f, estimateCacheTtlMinutes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={save}>حفظ الإعدادات</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────── Transport locations ─────────────────────

const EMPTY_LOC = { name: "", code: "", locationType: "", city: "", address: "", notes: "" };

function LocationsPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<any>(["transport-locations-admin"], "/transport/locations");
  const locations: any[] = data?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_LOC);

  const create = async () => {
    try {
      await apiFetch("/transport/locations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          code: form.code || undefined,
          locationType: form.locationType || undefined,
          city: form.city || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
        }),
      });
      toast({ title: "تم إنشاء الموقع" });
      setShowForm(false);
      setForm(EMPTY_LOC);
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإنشاء", description: err?.message });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">مواقع النقل ({locations.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "موقع جديد"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border bg-surface-subtle p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الاسم *</Label>
                <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>الرمز</Label>
                <Input className="mt-1" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <Label>النوع</Label>
                <Input className="mt-1" placeholder="warehouse / port / customer..." value={form.locationType} onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value }))} />
              </div>
              <div>
                <Label>المدينة</Label>
                <Input className="mt-1" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>العنوان</Label>
                <Input className="mt-1" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>ملاحظات</Label>
                <Input className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button size="sm" disabled={!form.name} onClick={create}>إنشاء</Button>
            </div>
          </div>
        )}
        {locations.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">لا توجد مواقع مسجلة</p>
        ) : (
          <div className="divide-y text-sm">
            {locations.map((loc: any) => (
              <div key={loc.id} className="py-2 flex items-center gap-3">
                <span className="font-medium">{loc.name}</span>
                {loc.code && <Badge variant="outline" className="text-xs font-mono">{loc.code}</Badge>}
                {loc.locationType && <Badge variant="secondary" className="text-xs">{loc.locationType}</Badge>}
                {loc.city && <span className="text-muted-foreground text-xs">{loc.city}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────── Page shell ───────────────────────────

export default function TransportRulesAdmin() {
  const [tab, setTab] = useState<"expense" | "intake" | "planning" | "locations">("expense");
  return (
    <PageShell
      title="قواعد العمليات والنفقات"
      subtitle="إدارة محرّكَي القواعد: تصنيف النفقات الافتراضي + متطلبات استقبال العمليات"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "قواعد العمليات والنفقات" },
      ]}
      actions={
        <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/bookings">
            <ArrowLeft className="h-4 w-4 me-1" />العودة
          </Link></Button>
      }
    >
      <FleetTabsNav />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "expense" | "intake" | "planning" | "locations")} className="mt-4">
        <TabsList>
          <TabsTrigger value="expense">
            <Wrench className="h-4 w-4 me-1" />تصنيف النفقات
          </TabsTrigger>
          <TabsTrigger value="intake">
            <Clipboard className="h-4 w-4 me-1" />استقبال العمليات
          </TabsTrigger>
          <TabsTrigger value="planning">
            إعدادات التخطيط
          </TabsTrigger>
          <TabsTrigger value="locations">
            المواقع
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expense" className="mt-3">
          <ExpenseRulesPanel />
        </TabsContent>
        <TabsContent value="intake" className="mt-3">
          <IntakeRulesPanel />
        </TabsContent>
        <TabsContent value="planning" className="mt-3">
          <PlanningSettingsPanel />
        </TabsContent>
        <TabsContent value="locations" className="mt-3">
          <LocationsPanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
