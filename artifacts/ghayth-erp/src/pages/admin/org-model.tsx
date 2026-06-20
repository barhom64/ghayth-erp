// ════════════════════════════════════════════════════════════════════════════
// نموذج المؤسسة التشغيلي — صفحة إدارة الجداول الستة لـ #1799 §B.
//   1) الكيانات القانونية (legal_entities)
//   2) المناصب الإدارية (positions)
//   3) الفِرَق (teams)
//   4) اللجان (committees)
//   5) خطوط الإشراف (supervision_lines)
//   6) صلاحيات الاعتماد (approval_authorities)
//
// كل قسم له:
//   - DataTable للقائمة
//   - زر إضافة يفتح Dialog
//   - حذف ناعم (isActive=false)
//
// تستخدم endpoints الموجودة في routes/org.ts (CRUD كامل).
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn, PageStatusBadge } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/formatters";
import { Plus, X, Trash2, Pencil, Building2, Briefcase, Users, Gavel, Network, Banknote } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────
interface LegalEntity {
  id: number; nameAr: string; nameEn?: string | null;
  crNumber?: string | null; vatNumber?: string | null; taxNumber?: string | null;
  isActive: boolean;
}
interface Position {
  id: number; companyId: number | null; positionKey: string;
  labelAr: string; labelEn?: string | null;
  description?: string | null; level: number;
  isActive: boolean; isSystem: boolean;
}
interface Team {
  id: number; name: string; departmentId?: number | null;
  leaderAssignmentId?: number | null; description?: string | null;
  scopeType?: string; isActive: boolean;
  departmentName?: string | null; leaderName?: string | null;
}
interface Committee {
  id: number; name: string; type: string; chairAssignmentId?: number | null;
  description?: string | null; startDate?: string | null; endDate?: string | null;
  isActive: boolean; chairName?: string | null;
}
interface SupervisionLine {
  id: number; supervisorAssignmentId: number; superviseeAssignmentId: number;
  lineType: string; scopeType?: string | null; scopeId?: number | null;
  startDate: string; endDate?: string | null; isPrimary: boolean;
  supervisorName?: string | null; superviseeName?: string | null;
}
interface ApprovalAuthority {
  id: number; assignmentId: number; featureKey: string; action: string;
  currency: string; maxAmount?: number | null; requiresDualControl: boolean;
  reason: string; expiresAt?: string | null; createdAt: string;
  employeeName?: string | null;
}

// ─── helper ────────────────────────────────────────────────────────────────
function useApi<T>(path: string) {
  return useApiQuery<{ data: T[] }>([path], path);
}

const PERM_LIST = "admin:list";
const PERM_WRITE = "admin:update";

// ════════════════════════════════════════════════════════════════════════════
// 1) Legal Entities
// ════════════════════════════════════════════════════════════════════════════
function LegalEntitiesTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<LegalEntity>("/org/legal-entities");
  const rows = asList<LegalEntity>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", crNumber: "", vatNumber: "", taxNumber: "" });
  const [editingRow, setEditingRow] = useState<LegalEntity | null>(null);
  const [editForm, setEditForm] = useState({ nameAr: "", nameEn: "", crNumber: "", vatNumber: "", taxNumber: "" });

  const save = async () => {
    if (!form.nameAr.trim()) { toast({ title: "الاسم العربي مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/legal-entities", { method: "POST", body: JSON.stringify({
        nameAr: form.nameAr.trim(), nameEn: form.nameEn || null,
        crNumber: form.crNumber || null, vatNumber: form.vatNumber || null, taxNumber: form.taxNumber || null,
      })});
      toast({ title: "تم إنشاء الكيان القانوني" });
      setShowForm(false);
      setForm({ nameAr: "", nameEn: "", crNumber: "", vatNumber: "", taxNumber: "" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل الحفظ", variant: "destructive" }); }
  };
  const update = async (id: number) => {
    if (!editForm.nameAr.trim()) { toast({ title: "الاسم العربي مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch(`/org/legal-entities/${id}`, { method: "PATCH", body: JSON.stringify({
        nameAr: editForm.nameAr.trim(), nameEn: editForm.nameEn || null,
        crNumber: editForm.crNumber || null, vatNumber: editForm.vatNumber || null, taxNumber: editForm.taxNumber || null,
      })});
      toast({ title: "تم التحديث" }); setEditingRow(null); refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل التحديث", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("تعطيل هذا الكيان؟ (حذف ناعم — لن يظهر في القوائم)")) return;
    try {
      await apiFetch(`/org/legal-entities/${id}`, { method: "DELETE" });
      toast({ title: "تم التعطيل" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<LegalEntity>[] = [
    { key: "nameAr", header: "الاسم العربي", render: (r) => <span className="font-medium">{r.nameAr}</span> },
    { key: "nameEn", header: "الاسم (إنجليزي)", render: (r) => r.nameEn || "—" },
    { key: "crNumber", header: "السجل التجاري", render: (r) => r.crNumber || "—" },
    { key: "vatNumber", header: "الرقم الضريبي", render: (r) => r.vatNumber || "—" },
    { key: "isActive", header: "الحالة", render: (r) => <PageStatusBadge status={r.isActive ? "active" : "inactive"} /> },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-1">
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1"
          onClick={() => { setEditingRow(r); setEditForm({ nameAr: r.nameAr, nameEn: r.nameEn || "", crNumber: r.crNumber || "", vatNumber: r.vatNumber || "", taxNumber: r.taxNumber || "" }); }}>
          <Pencil className="h-3.5 w-3.5" />
        </GuardedButton>
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1 text-status-error" onClick={() => remove(r.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </GuardedButton>
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      {editingRow && (
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-base">تعديل: {editingRow.nameAr}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>الاسم العربي *</Label><Input value={editForm.nameAr} onChange={(e) => setEditForm((f) => ({ ...f, nameAr: e.target.value }))} className="mt-1" /></div>
              <div><Label>Name (EN)</Label><Input value={editForm.nameEn} onChange={(e) => setEditForm((f) => ({ ...f, nameEn: e.target.value }))} className="mt-1" /></div>
              <div><Label>السجل التجاري</Label><Input value={editForm.crNumber} onChange={(e) => setEditForm((f) => ({ ...f, crNumber: e.target.value }))} className="mt-1" /></div>
              <div><Label>الرقم الضريبي (VAT)</Label><Input value={editForm.vatNumber} onChange={(e) => setEditForm((f) => ({ ...f, vatNumber: e.target.value }))} className="mt-1" /></div>
              <div><Label>رقم الإقرار الضريبي</Label><Input value={editForm.taxNumber} onChange={(e) => setEditForm((f) => ({ ...f, taxNumber: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" onClick={() => setEditingRow(null)}>إلغاء</Button>
              <GuardedButton perm={PERM_WRITE} onClick={() => update(editingRow.id)}>حفظ التعديلات</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 me-1" /> كيان جديد
          </GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">كيان قانوني جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>الاسم العربي *</Label><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} className="mt-1" /></div>
              <div><Label>Name (EN)</Label><Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} className="mt-1" /></div>
              <div><Label>السجل التجاري</Label><Input value={form.crNumber} onChange={(e) => setForm((f) => ({ ...f, crNumber: e.target.value }))} className="mt-1" /></div>
              <div><Label>الرقم الضريبي (VAT)</Label><Input value={form.vatNumber} onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} className="mt-1" /></div>
              <div><Label>رقم الإقرار الضريبي</Label><Input value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>حفظ</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد كيانات قانونية بعد" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2) Positions
// ════════════════════════════════════════════════════════════════════════════
function PositionsTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<Position>("/org/positions");
  const rows = asList<Position>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ positionKey: "", labelAr: "", labelEn: "", description: "", level: 30 });
  const [editingRow, setEditingRow] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState({ labelAr: "", labelEn: "", description: "", level: 30 });

  const save = async () => {
    if (!form.positionKey.match(/^[a-z][a-z0-9_]*$/)) { toast({ title: "مفتاح المنصب: إنجليزي صغير فقط", variant: "destructive" }); return; }
    if (!form.labelAr.trim()) { toast({ title: "الاسم العربي مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/positions", { method: "POST", body: JSON.stringify({
        positionKey: form.positionKey.trim(), labelAr: form.labelAr.trim(),
        labelEn: form.labelEn || null, description: form.description || null,
        level: form.level,
      })});
      toast({ title: "تم إنشاء المنصب" });
      setShowForm(false);
      setForm({ positionKey: "", labelAr: "", labelEn: "", description: "", level: 30 });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل الحفظ", variant: "destructive" }); }
  };
  const updatePos = async (id: number) => {
    if (!editForm.labelAr.trim()) { toast({ title: "الاسم العربي مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch(`/org/positions/${id}`, { method: "PATCH", body: JSON.stringify({
        labelAr: editForm.labelAr.trim(), labelEn: editForm.labelEn || null,
        description: editForm.description || null, level: editForm.level,
      })});
      toast({ title: "تم التحديث" }); setEditingRow(null); refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل التحديث", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("تعطيل هذا المنصب؟")) return;
    try { await apiFetch(`/org/positions/${id}`, { method: "DELETE" }); toast({ title: "تم التعطيل" }); refetch(); }
    catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Position>[] = [
    { key: "labelAr", header: "المنصب", render: (r) => (
      <div>
        <div className="font-medium">{r.labelAr}</div>
        <div className="text-xs text-muted-foreground font-mono">{r.positionKey}</div>
      </div>
    )},
    { key: "level", header: "المستوى", render: (r) => <Badge variant="outline">{r.level}</Badge> },
    { key: "isSystem", header: "نوع", render: (r) => r.isSystem
      ? <Badge variant="secondary" className="text-xs">قالب نظام</Badge>
      : <Badge variant="outline" className="text-xs">شركة</Badge>
    },
    { key: "isActive", header: "الحالة", render: (r) => <PageStatusBadge status={r.isActive ? "active" : "inactive"} /> },
    { key: "actions", header: "", render: (r) => r.isSystem ? <span className="text-xs text-muted-foreground">—</span> : (
      <div className="flex gap-1">
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1"
          onClick={() => { setEditingRow(r); setEditForm({ labelAr: r.labelAr, labelEn: r.labelEn || "", description: r.description || "", level: r.level }); }}>
          <Pencil className="h-3.5 w-3.5" />
        </GuardedButton>
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1 text-status-error" onClick={() => remove(r.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </GuardedButton>
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      {editingRow && (
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-base">تعديل: {editingRow.labelAr}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>الاسم العربي *</Label><Input value={editForm.labelAr} onChange={(e) => setEditForm((f) => ({ ...f, labelAr: e.target.value }))} className="mt-1" /></div>
              <div><Label>Label (EN)</Label><Input value={editForm.labelEn} onChange={(e) => setEditForm((f) => ({ ...f, labelEn: e.target.value }))} className="mt-1" /></div>
              <div><Label>المستوى (0..100)</Label><Input type="number" min={0} max={100} value={editForm.level} onChange={(e) => setEditForm((f) => ({ ...f, level: Number(e.target.value) }))} className="mt-1" /></div>
              <div><Label>الوصف</Label><Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" onClick={() => setEditingRow(null)}>إلغاء</Button>
              <GuardedButton perm={PERM_WRITE} onClick={() => updatePos(editingRow.id)}>حفظ التعديلات</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}><Plus className="h-4 w-4 me-1" /> منصب جديد</GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">منصب جديد (خاص بالشركة)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>مفتاح المنصب * (إنجليزي)</Label><Input value={form.positionKey} onChange={(e) => setForm((f) => ({ ...f, positionKey: e.target.value }))} placeholder="مثل: team_lead" className="mt-1 font-mono" /></div>
              <div><Label>الاسم العربي *</Label><Input value={form.labelAr} onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))} placeholder="مثل: قائد فريق" className="mt-1" /></div>
              <div><Label>Label (EN)</Label><Input value={form.labelEn} onChange={(e) => setForm((f) => ({ ...f, labelEn: e.target.value }))} className="mt-1" /></div>
              <div><Label>المستوى (0..100)</Label><Input type="number" min={0} max={100} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>حفظ</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد مناصب بعد" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3) Teams
// ════════════════════════════════════════════════════════════════════════════
function TeamsTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<Team>("/org/teams");
  const rows = asList<Team>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", scopeType: "department" });
  const [editingRow, setEditingRow] = useState<Team | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", scopeType: "department" });

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "اسم الفريق مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/teams", { method: "POST", body: JSON.stringify({
        name: form.name.trim(), description: form.description || null, scopeType: form.scopeType,
      })});
      toast({ title: "تم إنشاء الفريق" });
      setShowForm(false);
      setForm({ name: "", description: "", scopeType: "department" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const updateTeam = async (id: number) => {
    if (!editForm.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch(`/org/teams/${id}`, { method: "PATCH", body: JSON.stringify({
        name: editForm.name.trim(), description: editForm.description || null, scopeType: editForm.scopeType,
      })});
      toast({ title: "تم التحديث" }); setEditingRow(null); refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("تعطيل هذا الفريق؟")) return;
    try { await apiFetch(`/org/teams/${id}`, { method: "DELETE" }); toast({ title: "تم التعطيل" }); refetch(); }
    catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Team>[] = [
    { key: "name", header: "اسم الفريق", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "departmentName", header: "الإدارة", render: (r) => r.departmentName || "—" },
    { key: "leaderName", header: "القائد", render: (r) => r.leaderName || "—" },
    { key: "scopeType", header: "النطاق", render: (r) => <Badge variant="outline">{r.scopeType || "—"}</Badge> },
    { key: "isActive", header: "الحالة", render: (r) => <PageStatusBadge status={r.isActive ? "active" : "inactive"} /> },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-1">
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1"
          onClick={() => { setEditingRow(r); setEditForm({ name: r.name, description: r.description || "", scopeType: r.scopeType || "department" }); }}>
          <Pencil className="h-3.5 w-3.5" />
        </GuardedButton>
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1 text-status-error" onClick={() => remove(r.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </GuardedButton>
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      {editingRow && (
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-base">تعديل الفريق: {editingRow.name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>الاسم *</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>نطاق التأثير</Label>
                <Select value={editForm.scopeType} onValueChange={(v) => setEditForm((f) => ({ ...f, scopeType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department">إدارة واحدة</SelectItem>
                    <SelectItem value="branch">فرع كامل</SelectItem>
                    <SelectItem value="cross_company">عبر الشركات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2"><Label>وصف</Label><Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" onClick={() => setEditingRow(null)}>إلغاء</Button>
              <GuardedButton perm={PERM_WRITE} onClick={() => updateTeam(editingRow.id)}>حفظ التعديلات</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}><Plus className="h-4 w-4 me-1" /> فريق جديد</GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">فريق جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>اسم الفريق *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>نطاق التأثير</Label>
                <Select value={form.scopeType} onValueChange={(v) => setForm((f) => ({ ...f, scopeType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department">إدارة واحدة</SelectItem>
                    <SelectItem value="branch">فرع كامل</SelectItem>
                    <SelectItem value="cross_company">عبر الشركات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2"><Label>وصف</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">القائد والإدارة يُحدَّدان لاحقًا عبر التعديل أو ربط الموظفين.</p>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>حفظ</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد فِرَق بعد" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4) Committees
// ════════════════════════════════════════════════════════════════════════════
const COMMITTEE_TYPES = [
  { v: "audit", l: "تدقيق" }, { v: "discipline", l: "انضباط" },
  { v: "safety", l: "سلامة" }, { v: "procurement", l: "مشتريات" },
  { v: "ethics", l: "أخلاقيات" }, { v: "other", l: "أخرى" },
];

function CommitteesTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<Committee>("/org/committees");
  const rows = asList<Committee>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "audit", description: "", startDate: "", endDate: "" });
  const [editingRow, setEditingRow] = useState<Committee | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "audit", description: "", startDate: "", endDate: "" });

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "اسم اللجنة مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/committees", { method: "POST", body: JSON.stringify({
        name: form.name.trim(), type: form.type, description: form.description || null,
        startDate: form.startDate || null, endDate: form.endDate || null,
      })});
      toast({ title: "تم إنشاء اللجنة" });
      setShowForm(false);
      setForm({ name: "", type: "audit", description: "", startDate: "", endDate: "" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("تعطيل هذه اللجنة؟")) return;
    try { await apiFetch(`/org/committees/${id}`, { method: "DELETE" }); toast({ title: "تم التعطيل" }); refetch(); }
    catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const updateCommittee = async (id: number) => {
    if (!editForm.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
    try {
      await apiFetch(`/org/committees/${id}`, { method: "PATCH", body: JSON.stringify({
        name: editForm.name.trim(), type: editForm.type, description: editForm.description || null,
        startDate: editForm.startDate || null, endDate: editForm.endDate || null,
      })});
      toast({ title: "تم التحديث" }); setEditingRow(null); refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Committee>[] = [
    { key: "name", header: "اسم اللجنة", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: "النوع", render: (r) => <Badge variant="outline">{COMMITTEE_TYPES.find((t) => t.v === r.type)?.l || r.type}</Badge> },
    { key: "chairName", header: "الرئيس", render: (r) => r.chairName || "—" },
    { key: "startDate", header: "من", render: (r) => r.startDate || "—" },
    { key: "endDate", header: "إلى", render: (r) => r.endDate || "—" },
    { key: "isActive", header: "الحالة", render: (r) => <PageStatusBadge status={r.isActive ? "active" : "inactive"} /> },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-1">
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1"
          onClick={() => { setEditingRow(r); setEditForm({ name: r.name, type: r.type, description: r.description || "", startDate: r.startDate || "", endDate: r.endDate || "" }); }}>
          <Pencil className="h-3.5 w-3.5" />
        </GuardedButton>
        <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-1 text-status-error" onClick={() => remove(r.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </GuardedButton>
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      {editingRow && (
        <Card className="mb-4 border-primary/30">
          <CardHeader className="pb-2"><CardTitle className="text-base">تعديل اللجنة: {editingRow.name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>الاسم *</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>النوع</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMMITTEE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>تاريخ البدء</Label><Input type="date" value={editForm.startDate} onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>تاريخ الانتهاء</Label><Input type="date" value={editForm.endDate} onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label>الوصف</Label><Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" onClick={() => setEditingRow(null)}>إلغاء</Button>
              <GuardedButton perm={PERM_WRITE} onClick={() => updateCommittee(editingRow.id)}>حفظ التعديلات</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}><Plus className="h-4 w-4 me-1" /> لجنة جديدة</GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">لجنة جديدة</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>اسم اللجنة *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>النوع</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMMITTEE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>تاريخ البدء</Label><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>تاريخ الانتهاء (اختياري)</Label><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label>وصف الاختصاص</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">رئيس اللجنة + أعضاؤها يُضافون لاحقًا عبر التعديل.</p>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>حفظ</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد لجان بعد" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5) Supervision Lines
// ════════════════════════════════════════════════════════════════════════════
const LINE_TYPES = [
  { v: "administrative", l: "إداري" },
  { v: "project", l: "مشروع" },
  { v: "functional", l: "وظيفي" },
  { v: "dotted", l: "متقطّع (dotted)" },
];

function SupervisionLinesTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<SupervisionLine>("/org/supervision-lines?active=true");
  const rows = asList<SupervisionLine>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supervisorAssignmentId: "", superviseeAssignmentId: "", lineType: "administrative", isPrimary: false });

  const save = async () => {
    const sup = Number(form.supervisorAssignmentId); const svee = Number(form.superviseeAssignmentId);
    if (!sup || !svee) { toast({ title: "معرّفات تعيين الموظفين مطلوبة", variant: "destructive" }); return; }
    if (sup === svee) { toast({ title: "لا يمكن للموظف الإشراف على نفسه", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/supervision-lines", { method: "POST", body: JSON.stringify({
        supervisorAssignmentId: sup, superviseeAssignmentId: svee,
        lineType: form.lineType, isPrimary: form.isPrimary,
      })});
      toast({ title: "تم إضافة خط الإشراف" });
      setShowForm(false);
      setForm({ supervisorAssignmentId: "", superviseeAssignmentId: "", lineType: "administrative", isPrimary: false });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("إنهاء خط الإشراف هذا اعتبارًا من اليوم؟")) return;
    try { await apiFetch(`/org/supervision-lines/${id}`, { method: "DELETE" }); toast({ title: "تم الإنهاء" }); refetch(); }
    catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<SupervisionLine>[] = [
    { key: "supervisorName", header: "المشرف", render: (r) => (
      <div><div className="font-medium">{r.supervisorName || `#${r.supervisorAssignmentId}`}</div>
      <div className="text-xs text-muted-foreground">assignment #{r.supervisorAssignmentId}</div></div>
    )},
    { key: "superviseeName", header: "المُشرَف عليه", render: (r) => (
      <div><div className="font-medium">{r.superviseeName || `#${r.superviseeAssignmentId}`}</div>
      <div className="text-xs text-muted-foreground">assignment #{r.superviseeAssignmentId}</div></div>
    )},
    { key: "lineType", header: "نوع الخط", render: (r) => <Badge variant="outline">{LINE_TYPES.find((t) => t.v === r.lineType)?.l || r.lineType}</Badge> },
    { key: "isPrimary", header: "أساسي؟", render: (r) => r.isPrimary ? <Badge>نعم</Badge> : <span className="text-muted-foreground">—</span> },
    { key: "startDate", header: "منذ", render: (r) => r.startDate },
    { key: "actions", header: "", render: (r) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => remove(r.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}><Plus className="h-4 w-4 me-1" /> خط إشراف</GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">خط إشراف جديد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>معرّف تعيين المشرف *</Label><Input type="number" value={form.supervisorAssignmentId} onChange={(e) => setForm((f) => ({ ...f, supervisorAssignmentId: e.target.value }))} className="mt-1" /></div>
              <div><Label>معرّف تعيين المُشرَف عليه *</Label><Input type="number" value={form.superviseeAssignmentId} onChange={(e) => setForm((f) => ({ ...f, superviseeAssignmentId: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>نوع الخط</Label>
                <Select value={form.lineType} onValueChange={(v) => setForm((f) => ({ ...f, lineType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{LINE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="primary" checked={form.isPrimary} onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))} />
                <Label htmlFor="primary" className="cursor-pointer">خط الإشراف الأساسي</Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              معرّف التعيين (assignmentId) يُؤخذ من ملف الموظف &gt; تبويب «المسميات والمناصب». موظف واحد قد يكون له
              عدة تعيينات (متعدد الشركات).
            </p>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>إضافة</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد خطوط إشراف نشطة" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 6) Approval Authorities (per-person overrides)
// ════════════════════════════════════════════════════════════════════════════
function ApprovalAuthoritiesTab() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApi<ApprovalAuthority>("/org/approval-authorities?active=true");
  const rows = asList<ApprovalAuthority>(data?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    assignmentId: "", featureKey: "", action: "approve", currency: "SAR",
    maxAmount: "", requiresDualControl: false, reason: "", expiresAt: "",
  });

  const save = async () => {
    const id = Number(form.assignmentId);
    if (!id) { toast({ title: "معرّف تعيين الموظف مطلوب", variant: "destructive" }); return; }
    if (!form.featureKey.trim() || !form.action.trim()) { toast({ title: "حقلا الميزة (feature) والإجراء (action) مطلوبان", variant: "destructive" }); return; }
    if (!form.reason.trim()) { toast({ title: "السبب مطلوب — هذا تجاوز للقالب", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/approval-authorities", { method: "POST", body: JSON.stringify({
        assignmentId: id, featureKey: form.featureKey.trim(), action: form.action.trim(),
        currency: form.currency, maxAmount: form.maxAmount ? Number(form.maxAmount) : null,
        requiresDualControl: form.requiresDualControl, reason: form.reason.trim(),
        expiresAt: form.expiresAt || null,
      })});
      toast({ title: "تم منح صلاحية الاعتماد" });
      setShowForm(false);
      setForm({ assignmentId: "", featureKey: "", action: "approve", currency: "SAR", maxAmount: "", requiresDualControl: false, reason: "", expiresAt: "" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const remove = async (id: number) => {
    if (!confirm("إلغاء صلاحية الاعتماد هذه؟ (حذف نهائي)")) return;
    try { await apiFetch(`/org/approval-authorities/${id}`, { method: "DELETE" }); toast({ title: "تم الإلغاء" }); refetch(); }
    catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<ApprovalAuthority>[] = [
    { key: "employeeName", header: "الموظف", render: (r) => (
      <div><div className="font-medium">{r.employeeName || `#${r.assignmentId}`}</div>
      <div className="text-xs text-muted-foreground">assignment #{r.assignmentId}</div></div>
    )},
    { key: "featureKey", header: "الميزة (feature)", render: (r) => <code className="text-xs font-mono">{r.featureKey}</code> },
    { key: "action", header: "الإجراء (action)", render: (r) => <Badge variant="outline">{r.action}</Badge> },
    { key: "maxAmount", header: "الحد الأقصى", render: (r) => r.maxAmount != null
      ? <span className="font-mono">{formatNumber(r.maxAmount)} {r.currency}</span>
      : <Badge variant="secondary">بلا حد</Badge>
    },
    { key: "requiresDualControl", header: "توقيع مزدوج؟", render: (r) => r.requiresDualControl ? <Badge>نعم</Badge> : <span className="text-muted-foreground">—</span> },
    { key: "reason", header: "السبب", render: (r) => <span className="text-xs">{r.reason}</span> },
    { key: "expiresAt", header: "ينتهي", render: (r) => r.expiresAt ? r.expiresAt.slice(0, 10) : <span className="text-muted-foreground">دائم</span> },
    { key: "actions", header: "", render: (r) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => remove(r.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  return (
    <div>
      <div className="flex justify-end mb-3">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}><Plus className="h-4 w-4 me-1" /> صلاحية جديدة</GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(false)}><X className="h-4 w-4 me-1" /> إلغاء</Button>
        )}
      </div>
      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">منح صلاحية اعتماد لشخص محدد</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>معرّف تعيين الموظف *</Label><Input type="number" value={form.assignmentId} onChange={(e) => setForm((f) => ({ ...f, assignmentId: e.target.value }))} className="mt-1" /></div>
              <div><Label>feature key *</Label><Input value={form.featureKey} onChange={(e) => setForm((f) => ({ ...f, featureKey: e.target.value }))} placeholder="مثل: finance.invoices" className="mt-1 font-mono" /></div>
              <div><Label>action *</Label><Input value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} placeholder="approve / release / pay" className="mt-1 font-mono" /></div>
              <div><Label>العملة</Label><Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} className="mt-1" /></div>
              <div><Label>الحد الأقصى (اتركه فارغًا = بلا حد)</Label><Input type="number" value={form.maxAmount} onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))} className="mt-1" /></div>
              <div><Label>ينتهي في (اختياري)</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} className="mt-1" /></div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="dual" checked={form.requiresDualControl} onChange={(e) => setForm((f) => ({ ...f, requiresDualControl: e.target.checked }))} />
                <Label htmlFor="dual" className="cursor-pointer">يتطلب توقيعًا مزدوجًا (dual-control)</Label>
              </div>
              <div className="sm:col-span-2"><Label>السبب * (مطلوب — تجاوز قالب الدور)</Label><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="مثل: مدير المنطقة الجنوبية بحاجة لاعتماد الفواتير الميدانية حتى 50,000 ر.س" className="mt-1" /></div>
            </div>
            <div className="flex justify-end mt-3"><GuardedButton perm={PERM_WRITE} onClick={save}>منح الصلاحية</GuardedButton></div>
          </CardContent>
        </Card>
      )}
      <DataTable data={rows} columns={columns} emptyMessage="لا توجد صلاحيات اعتماد على مستوى الشخص" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function OrgModelPage() {
  return (
    <PageShell
      title="نموذج المؤسسة التشغيلي"
      subtitle="الكيانات القانونية، المناصب، الفِرَق، اللجان، خطوط الإشراف، صلاحيات الاعتماد"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin", label: "الإدارة" },
        { label: "نموذج المؤسسة" },
      ]}
    >
      <Tabs defaultValue="legal-entities" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="legal-entities" className="gap-2"><Building2 className="h-4 w-4" /> الكيانات القانونية</TabsTrigger>
          <TabsTrigger value="positions" className="gap-2"><Briefcase className="h-4 w-4" /> المناصب</TabsTrigger>
          <TabsTrigger value="teams" className="gap-2"><Users className="h-4 w-4" /> الفِرَق</TabsTrigger>
          <TabsTrigger value="committees" className="gap-2"><Gavel className="h-4 w-4" /> اللجان</TabsTrigger>
          <TabsTrigger value="supervision-lines" className="gap-2"><Network className="h-4 w-4" /> خطوط الإشراف</TabsTrigger>
          <TabsTrigger value="approval-authorities" className="gap-2"><Banknote className="h-4 w-4" /> صلاحيات الاعتماد</TabsTrigger>
        </TabsList>
        <TabsContent value="legal-entities" className="mt-4"><LegalEntitiesTab /></TabsContent>
        <TabsContent value="positions" className="mt-4"><PositionsTab /></TabsContent>
        <TabsContent value="teams" className="mt-4"><TeamsTab /></TabsContent>
        <TabsContent value="committees" className="mt-4"><CommitteesTab /></TabsContent>
        <TabsContent value="supervision-lines" className="mt-4"><SupervisionLinesTab /></TabsContent>
        <TabsContent value="approval-authorities" className="mt-4"><ApprovalAuthoritiesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
