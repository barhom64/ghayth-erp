import { useState, useMemo } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Workflow, Clock, AlertTriangle, Plus, X, Save, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

export function WorkflowDefinitionsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["workflow-definitions"], "/workflows/definitions");
  const { data: slaData, refetch: refetchSla } = useApiQuery<any>(["sla-definitions"], "/workflows/sla-definitions");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSlaForm, setShowSlaForm] = useState(false);
  const [deletingDef, setDeletingDef] = useState<{ id: number; name: string } | null>(null);

  const REQUEST_TYPES = [
    { value: "leave", label: "إجازة" },
    { value: "purchase_request", label: "طلب شراء" },
    { value: "salary_advance", label: "سلفة" },
    { value: "custody", label: "عهدة" },
    { value: "official_letter", label: "خطاب رسمي" },
    { value: "maintenance", label: "صيانة" },
    { value: "financial_claim", label: "مطالبة مالية" },
    { value: "expense", label: "مصروف" },
    { value: "general", label: "طلب عام" },
  ];

  const ROLES = [
    { value: "manager", label: "المدير المباشر" },
    { value: "hr", label: "الموارد البشرية" },
    { value: "finance", label: "المالية" },
    { value: "director", label: "المدير العام" },
    { value: "owner", label: "المالك" },
    { value: "procurement", label: "المشتريات" },
  ];

  const [form, setForm] = useState({
    requestType: "leave",
    requestTypeLabel: "إجازة",
    description: "",
    isReturnable: true,
    enableEscalation: true,
    defaultSlaHours: 48,
    steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }] as { stepName: string; requiredRole: string; slaHours: number; autoApproveOnTimeout: boolean }[],
  });

  const [slaForm, setSlaForm] = useState({
    requestType: "leave",
    warningHours: 24,
    deadlineHours: 48,
    escalationHours: 72,
    autoApproveOnTimeout: false,
    escalateTo: "hr",
  });

  const defs = asList(data?.data ?? data);
  const slas = asList(slaData?.data ?? slaData);

  const slaColumns = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: "requestType",
      header: "النوع",
      render: (s: any) => REQUEST_TYPES.find(t => t.value === s.requestType)?.label || s.requestType,
    },
    {
      key: "warningHours",
      header: "تنبيه",
      render: (s: any) => `${s.warningHours}س`,
    },
    {
      key: "deadlineHours",
      header: "مهلة",
      render: (s: any) => `${s.deadlineHours}س`,
    },
    {
      key: "escalationHours",
      header: "تصعيد",
      render: (s: any) => `${s.escalationHours}س`,
    },
    {
      key: "escalateTo",
      header: "تصعيد إلى",
      render: (s: any) => ROLES.find(r => r.value === s.escalateTo)?.label || s.escalateTo,
    },
    {
      key: "autoApproveOnTimeout",
      header: "تلقائي",
      render: (s: any) => s.autoApproveOnTimeout ? "نعم" : "لا",
    },
  ], []);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const resetForm = () => {
    setForm({
      requestType: "leave", requestTypeLabel: "إجازة", description: "",
      isReturnable: true, enableEscalation: true, defaultSlaHours: 48,
      steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = async (def: any) => {
    try {
      const detail = await apiFetch(`/workflows/definitions/${def.id}`);
      const d = detail as any;
      setForm({
        requestType: d.requestType,
        requestTypeLabel: d.requestTypeLabel,
        description: d.description || "",
        isReturnable: d.isReturnable,
        enableEscalation: d.enableEscalation,
        defaultSlaHours: d.defaultSlaHours,
        steps: (d.steps || []).map((s: any) => ({
          stepName: s.stepName, requiredRole: s.requiredRole,
          slaHours: s.slaHours, autoApproveOnTimeout: s.autoApproveOnTimeout,
        })),
      });
      setEditingId(d.id);
      setShowForm(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/workflows/definitions/${editingId}`, {
          method: "PUT", body: JSON.stringify(form),
        });
        toast({ title: "تم التحديث" });
      } else {
        await apiFetch("/workflows/definitions", {
          method: "POST", body: JSON.stringify(form),
        });
        toast({ title: "تمت الإضافة" });
      }
      resetForm();
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleDeleteDone = () => {
    setDeletingDef(null);
    refetch();
  };

  const handleSaveSla = async () => {
    try {
      await apiFetch("/workflows/sla-definitions", {
        method: "POST", body: JSON.stringify(slaForm),
      });
      toast({ title: "تم حفظ إعدادات المهلة" });
      setShowSlaForm(false);
      refetchSla();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const addStep = () => {
    setForm({ ...form, steps: [...form.steps, { stepName: "", requiredRole: "hr", slaHours: 48, autoApproveOnTimeout: false }] });
  };

  const removeStep = (idx: number) => {
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) });
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const steps = [...form.steps];
    (steps[idx] as any)[field] = value;
    setForm({ ...form, steps });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Workflow className="h-5 w-5" />
          محرك الإجراءات الموحد
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSlaForm(!showSlaForm)}>
            <Clock className="h-4 w-4 me-1" />{showSlaForm ? "إخفاء" : "إعدادات مستوى الخدمة"}
          </Button>
          <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />تعريف جديد</>}
          </Button>
        </div>
      </div>

      {showSlaForm && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />إعدادات المهل الزمنية</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>نوع الطلب</Label>
                <Select value={slaForm.requestType} onValueChange={(v) => setSlaForm({ ...slaForm, requestType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>تنبيه بعد (ساعة)</Label><Input type="number" value={slaForm.warningHours} onChange={(e) => setSlaForm({ ...slaForm, warningHours: Number(e.target.value) })} /></div>
              <div><Label>المهلة القصوى (ساعة)</Label><Input type="number" value={slaForm.deadlineHours} onChange={(e) => setSlaForm({ ...slaForm, deadlineHours: Number(e.target.value) })} /></div>
              <div><Label>تصعيد بعد (ساعة)</Label><Input type="number" value={slaForm.escalationHours} onChange={(e) => setSlaForm({ ...slaForm, escalationHours: Number(e.target.value) })} /></div>
              <div>
                <Label>تصعيد إلى</Label>
                <Select value={slaForm.escalateTo} onValueChange={(v) => setSlaForm({ ...slaForm, escalateTo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={slaForm.autoApproveOnTimeout} onCheckedChange={(v) => setSlaForm({ ...slaForm, autoApproveOnTimeout: v === true })} />
                  <span className="text-sm">موافقة تلقائية عند التجاوز</span>
                </label>
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSla}><Save className="h-4 w-4 me-1" />حفظ إعدادات مستوى الخدمة</Button>

            {slas.length > 0 && (
              <div className="mt-4">
                <DataTable
                  columns={slaColumns}
                  data={slas}
                  pageSize={0}
                  noToolbar
                  searchPlaceholder={null}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>نوع الطلب</Label>
                <Select value={form.requestType}
                  onValueChange={(v) => {
                    const t = REQUEST_TYPES.find(r => r.value === v);
                    setForm({ ...form, requestType: v, requestTypeLabel: t?.label || v });
                  }}
                  disabled={!!editingId}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>العنوان</Label><Input value={form.requestTypeLabel} onChange={(e) => setForm({ ...form, requestTypeLabel: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>المهلة الافتراضية (ساعة)</Label><Input type="number" value={form.defaultSlaHours} onChange={(e) => setForm({ ...form, defaultSlaHours: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-6 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.isReturnable} onCheckedChange={(v) => setForm({ ...form, isReturnable: v === true })} />
                  <span className="text-sm">قابل للإرجاع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.enableEscalation} onCheckedChange={(v) => setForm({ ...form, enableEscalation: v === true })} />
                  <span className="text-sm">تصعيد تلقائي</span>
                </label>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">خطوات الموافقة</h4>
                <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 me-1" />خطوة</Button>
              </div>
              <div className="space-y-3">
                {form.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">{idx + 1}</div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input placeholder="اسم الخطوة" value={step.stepName} onChange={(e) => updateStep(idx, "stepName", e.target.value)} />
                      <Select value={step.requiredRole} onValueChange={(v) => updateStep(idx, "requiredRole", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="مهلة (ساعة)" value={step.slaHours} onChange={(e) => updateStep(idx, "slaHours", Number(e.target.value))} />
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <Checkbox checked={step.autoApproveOnTimeout} onCheckedChange={(v) => updateStep(idx, "autoApproveOnTimeout", v === true)} />
                        موافقة تلقائية
                      </label>
                    </div>
                    {form.steps.length > 1 && (
                      <Button size="sm" variant="ghost" className="text-red-500 shrink-0" onClick={() => removeStep(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave}><Save className="h-4 w-4 me-1" />{editingId ? "تحديث" : "حفظ"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {defs.map((def: any) => (
          <Card key={def.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold">{def.requestTypeLabel}</span>
                  <Badge variant="outline" className="text-xs">{def.requestType}</Badge>
                  <Badge variant={def.isActive ? "default" : "secondary"} className="text-xs">
                    {def.isActive ? "مفعّل" : "معطّل"}
                  </Badge>
                  {def.enableEscalation && <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">تصعيد</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(def)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeletingDef({ id: def.id, name: def.requestTypeLabel })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {def.description && <p className="text-sm text-gray-500 mb-2">{def.description}</p>}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>المهلة: {def.defaultSlaHours} ساعة</span>
                <span className="mx-1">|</span>
                <span>{def.stepCount || 0} خطوة</span>
                {def.isReturnable && <><span className="mx-1">|</span><span>قابل للإرجاع</span></>}
              </div>
            </CardContent>
          </Card>
        ))}
        {defs.length === 0 && !showForm && (
          <Card><CardContent className="p-8 text-center text-gray-400">
            لا توجد تعريفات إجراءات. أضف تعريفاً جديداً لتبدأ.
          </CardContent></Card>
        )}
      </div>

      <ConfirmDeleteDialog
        open={deletingDef !== null}
        onOpenChange={(v) => !v && setDeletingDef(null)}
        entity={{
          type: "workflow-definition",
          id: deletingDef?.id ?? 0,
          name: deletingDef?.name ?? "",
        }}
        deletePath={`/workflows/definitions/${deletingDef?.id}`}
        invalidateKeys={[["workflow-definitions"]]}
        onDeleted={handleDeleteDone}
      />
    </div>
  );
}
