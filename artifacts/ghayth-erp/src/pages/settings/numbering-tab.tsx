// Settings → إعدادات الترقيم (Issue #1141)
//
// Manages the central numbering authority. The tab is split into
// three panels:
//   1. Policies — the `numbering_schemes` rows; click to edit pattern,
//      prefix, padding, reset/scope/issue timing, manual-edit policy.
//   2. Counters — per-scope current state for the selected scheme;
//      shows live next number, allows reset + lock/unlock.
//   3. Assignment & audit log — search the history of issued numbers
//      and the audit trail of policy changes / overrides.
//
// Every privileged action carries a mandatory reason field and routes
// through the API guards on `settings.numbering[.override|.reset|.audit]`.

import { useState, useMemo } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Hash, Lock, Unlock, RotateCcw, Edit, Eye, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";

interface Scheme {
  id: number;
  moduleKey: string;
  entityKey: string;
  displayNameAr: string;
  displayNameEn: string | null;
  prefix: string;
  pattern: string;
  padLength: number;
  resetPolicy: string;
  scopePolicy: string;
  issueTiming: string;
  manualEditPolicy: string;
  requiresReasonOnManualEdit: boolean;
  lockAfterStatuses: string[] | string;
  branchPrefixOverrides: Record<string, string> | string;
  isActive: boolean;
  updatedAt: string;
}

interface Counter {
  id: number;
  branchId: number | null;
  fiscalYear: number | null;
  period: string | null;
  seasonId: number | null;
  lastNumber: string;
  nextNumber: string;
  lockedAt: string | null;
}

interface Assignment {
  id: number;
  number: string;
  moduleKey: string;
  entityKey: string;
  entityTable: string;
  entityId: number | null;
  branchId: number | null;
  status: string;
  issuedAt: string;
  schemeName: string | null;
  voidReason: string | null;
}

interface AuditRow {
  id: number;
  action: string;
  schemeId: number | null;
  assignmentId: number | null;
  entityTable: string | null;
  entityId: number | null;
  actorName: string | null;
  schemeName: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

const RESET_LABEL: Record<string, string> = {
  never: "بدون تصفير",
  yearly: "سنوي",
  monthly: "شهري",
  seasonal: "موسمي",
  fiscal_year: "سنة مالية",
};
const SCOPE_LABEL: Record<string, string> = {
  company: "شركة",
  branch: "فرع",
  module: "مسار",
  entity: "نوع",
  season: "موسم",
  fiscal_year: "سنة مالية",
};
const TIMING_LABEL: Record<string, string> = {
  on_draft: "عند إنشاء المسودة",
  on_submit: "عند التقديم",
  on_approval: "عند الاعتماد",
  on_posting: "عند الترحيل",
};
const EDIT_LABEL: Record<string, string> = {
  disabled: "ممنوع نهائيًا",
  draft_only: "قبل الاعتماد فقط",
  privileged: "بصلاحية خاصة",
  legacy_import_only: "استيراد قديم فقط",
};

export function NumberingTab() {
  const { data, refetch, isLoading, isError, error } = useApiQuery<{ data: Scheme[] }>(
    ["numbering-schemes"], "/numbering/schemes",
  );
  const schemes = asList<Scheme>(data);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [viewingScheme, setViewingScheme] = useState<Scheme | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Hash className="w-5 h-5 text-status-info" />
          إعدادات الترقيم الموحد
        </h3>
        <Badge variant="outline" className="text-xs">
          {schemes.length} سياسة
        </Badge>
      </div>

      <Tabs defaultValue="policies" dir="rtl">
        <TabsList>
          <TabsTrigger value="policies">السياسات</TabsTrigger>
          <TabsTrigger value="assignments">سجل الأرقام</TabsTrigger>
          <TabsTrigger value="audit">سجل التدقيق</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-subtle">
                  <th className="p-3 text-start">المسار / النوع</th>
                  <th className="p-3 text-start">البادئة</th>
                  <th className="p-3 text-start">النمط</th>
                  <th className="p-3 text-start">النطاق</th>
                  <th className="p-3 text-start">التصفير</th>
                  <th className="p-3 text-start">التعديل اليدوي</th>
                  <th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-end w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {schemes.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-surface-subtle">
                    <td className="p-3">
                      <div className="font-medium">{s.displayNameAr}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {s.moduleKey}.{s.entityKey}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-sm">{s.prefix}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.pattern}</td>
                    <td className="p-3 text-xs">{SCOPE_LABEL[s.scopePolicy] || s.scopePolicy}</td>
                    <td className="p-3 text-xs">{RESET_LABEL[s.resetPolicy] || s.resetPolicy}</td>
                    <td className="p-3 text-xs">{EDIT_LABEL[s.manualEditPolicy] || s.manualEditPolicy}</td>
                    <td className="p-3">
                      <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                        {s.isActive ? "نشطة" : "متوقفة"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setViewingScheme(s)} title="عرض العدادات">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <GuardedButton
                          perm="settings.numbering:update"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingScheme(s)}
                          title="تعديل"
                        >
                          <Edit className="h-4 w-4" />
                        </GuardedButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {schemes.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                    لا توجد سياسات ترقيم — قاعدة البيانات لم تصل بعد إلى الـ seed
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsPanel schemes={schemes} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>

      {editingScheme && (
        <SchemeEditDialog
          scheme={editingScheme}
          onClose={() => { setEditingScheme(null); refetch(); }}
        />
      )}
      {viewingScheme && (
        <CountersDialog
          scheme={viewingScheme}
          onClose={() => setViewingScheme(null)}
        />
      )}
    </div>
  );
}

// ─── Scheme edit dialog ──────────────────────────────────────────

function SchemeEditDialog({ scheme, onClose }: { scheme: Scheme; onClose: () => void }) {
  const { toast } = useToast();
  const initial = {
    displayNameAr: scheme.displayNameAr,
    prefix: scheme.prefix,
    pattern: scheme.pattern,
    padLength: scheme.padLength,
    resetPolicy: scheme.resetPolicy,
    scopePolicy: scheme.scopePolicy,
    issueTiming: scheme.issueTiming,
    manualEditPolicy: scheme.manualEditPolicy,
    requiresReasonOnManualEdit: scheme.requiresReasonOnManualEdit,
    isActive: scheme.isActive,
    lockAfterStatuses: Array.isArray(scheme.lockAfterStatuses)
      ? scheme.lockAfterStatuses.join(",")
      : scheme.lockAfterStatuses,
  };
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");

  const saveMut = useApiMutation<any, Record<string, unknown>>(
    `/numbering/schemes/${scheme.id}`, "PATCH",
    [["numbering-schemes"]],
    {
      successMessage: "تم تحديث السياسة",
      onSuccess: onClose,
    },
  );

  const handleSave = () => {
    if (reason.trim().length < 3) {
      toast({ title: "السبب مطلوب", description: "يرجى كتابة سبب التعديل (3 أحرف على الأقل)" });
      return;
    }
    saveMut.mutate({
      ...form,
      lockAfterStatuses: form.lockAfterStatuses
        .split(",").map((s) => s.trim()).filter(Boolean),
      reason,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>تعديل سياسة الترقيم — {scheme.displayNameAr}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{scheme.moduleKey}.{scheme.entityKey}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الاسم بالعربية</Label>
            <Input value={form.displayNameAr} onChange={(e) => setForm({ ...form, displayNameAr: e.target.value })} />
          </div>
          <div>
            <Label>البادئة</Label>
            <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} />
          </div>
          <div className="md:col-span-2">
            <Label>النمط</Label>
            <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} dir="ltr" className="font-mono" />
            <p className="text-xs text-muted-foreground mt-1">
              الرموز: <code>{"{PREFIX}"}</code> <code>{"{BRANCH}"}</code> <code>{"{YYYY}"}</code> <code>{"{YY}"}</code> <code>{"{MM}"}</code> <code>{"{SEASON}"}</code> <code>{"{SEQ}"}</code>
            </p>
          </div>
          <div>
            <Label>طول التسلسل (أصفار)</Label>
            <Input type="number" min={3} max={10}
              value={form.padLength}
              onChange={(e) => setForm({ ...form, padLength: Number(e.target.value) || 4 })}
            />
          </div>
          <div>
            <Label>نطاق العداد</Label>
            <Select value={form.scopePolicy} onValueChange={(v) => setForm({ ...form, scopePolicy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>إعادة التصفير</Label>
            <Select value={form.resetPolicy} onValueChange={(v) => setForm({ ...form, resetPolicy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RESET_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>توقيت إصدار الرقم</Label>
            <Select value={form.issueTiming} onValueChange={(v) => setForm({ ...form, issueTiming: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIMING_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>سياسة التعديل اليدوي</Label>
            <Select value={form.manualEditPolicy} onValueChange={(v) => setForm({ ...form, manualEditPolicy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EDIT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>حالات تقفل الرقم بعدها (يفصل بينها فاصلة)</Label>
            <Input
              value={form.lockAfterStatuses}
              onChange={(e) => setForm({ ...form, lockAfterStatuses: e.target.value })}
              placeholder="approved, posted, sent, closed"
              dir="ltr" className="font-mono"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>السياسة نشطة</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.requiresReasonOnManualEdit}
                onCheckedChange={(v) => setForm({ ...form, requiresReasonOnManualEdit: v })}
              />
              <Label>إلزام سبب عند التعديل اليدوي</Label>
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>سبب التعديل (إلزامي)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="مثال: تغيير البادئة لكل الفروع بعد قرار المدير العام رقم …" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saveMut.isPending} rateLimitAware>
            {saveMut.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Counters dialog ─────────────────────────────────────────────

function CountersDialog({ scheme, onClose }: { scheme: Scheme; onClose: () => void }) {
  const { toast } = useToast();
  const { data, refetch, isLoading } = useApiQuery<{ data: Scheme; counters: Counter[] }>(
    ["numbering-scheme-detail", String(scheme.id)], `/numbering/schemes/${scheme.id}`,
  );
  const counters = (data?.counters || []) as Counter[];

  const resetMut = useApiMutation<any, { counterId: number; newValue: number; reason: string; force?: boolean }>(
    (b) => `/numbering/counters/${b.counterId}/reset`, "POST",
    [["numbering-scheme-detail", String(scheme.id)]],
    {
      successMessage: "تم تصفير العداد",
      onSuccess: refetch,
    },
  );

  const lockMut = useApiMutation<any, { counterId: number; reason: string }>(
    (b) => `/numbering/counters/${b.counterId}/lock`, "POST",
    [["numbering-scheme-detail", String(scheme.id)]],
    { onSuccess: refetch, successMessage: "تم قفل العداد" },
  );
  const unlockMut = useApiMutation<any, { counterId: number; reason: string }>(
    (b) => `/numbering/counters/${b.counterId}/unlock`, "POST",
    [["numbering-scheme-detail", String(scheme.id)]],
    { onSuccess: refetch, successMessage: "تم فتح العداد" },
  );

  const askForReason = (label: string): string | null => {
    const r = window.prompt(label);
    if (!r || r.trim().length < 3) {
      toast({ title: "السبب مطلوب", description: "السبب لا يقل عن 3 أحرف" });
      return null;
    }
    return r.trim();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>عدادات سياسة {scheme.displayNameAr}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {scheme.moduleKey}.{scheme.entityKey}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? <LoadingSpinner /> : (
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-subtle">
                  <th className="p-3 text-start">الفرع</th>
                  <th className="p-3 text-start">السنة</th>
                  <th className="p-3 text-start">الموسم</th>
                  <th className="p-3 text-start">آخر رقم</th>
                  <th className="p-3 text-start">الرقم القادم</th>
                  <th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {counters.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-3">{c.branchId ?? "—"}</td>
                    <td className="p-3">{c.fiscalYear ?? "—"}</td>
                    <td className="p-3">{c.seasonId ?? "—"}</td>
                    <td className="p-3 font-mono">{c.lastNumber}</td>
                    <td className="p-3 font-mono font-semibold">{c.nextNumber}</td>
                    <td className="p-3">
                      <Badge variant={c.lockedAt ? "destructive" : "default"} className="text-xs">
                        {c.lockedAt ? "مقفول" : "نشط"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <GuardedButton
                          perm="settings.numbering.reset:update"
                          variant="ghost"
                          size="sm"
                          title="تصفير"
                          onClick={() => {
                            const r = askForReason("سبب تصفير العداد:");
                            if (!r) return;
                            const v = Number(window.prompt("القيمة الجديدة للعداد:", "1"));
                            if (!Number.isFinite(v) || v < 0) return;
                            resetMut.mutate({ counterId: c.id, newValue: v, reason: r });
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </GuardedButton>
                        {c.lockedAt ? (
                          <GuardedButton
                            perm="settings.numbering:update"
                            variant="ghost"
                            size="sm"
                            title="فتح القفل"
                            onClick={() => {
                              const r = askForReason("سبب فتح العداد:");
                              if (r) unlockMut.mutate({ counterId: c.id, reason: r });
                            }}
                          >
                            <Unlock className="h-4 w-4" />
                          </GuardedButton>
                        ) : (
                          <GuardedButton
                            perm="settings.numbering:update"
                            variant="ghost"
                            size="sm"
                            title="قفل العداد"
                            onClick={() => {
                              const r = askForReason("سبب قفل العداد:");
                              if (r) lockMut.mutate({ counterId: c.id, reason: r });
                            }}
                          >
                            <Lock className="h-4 w-4" />
                          </GuardedButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {counters.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    لم يصدر أي رقم بعد لهذه السياسة
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent></Card>
        )}
        <DialogFooter>
          <Button onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assignments panel ──────────────────────────────────────────

function AssignmentsPanel({ schemes }: { schemes: Scheme[] }) {
  const [filters, setFilters] = useState<{ moduleKey?: string; entityKey?: string; status?: string; q?: string }>({});
  const query = useMemo(() => {
    const u = new URLSearchParams();
    if (filters.moduleKey) u.set("moduleKey", filters.moduleKey);
    if (filters.entityKey) u.set("entityKey", filters.entityKey);
    if (filters.status) u.set("status", filters.status);
    if (filters.q) u.set("q", filters.q);
    return u.toString();
  }, [filters]);
  const url = `/numbering/assignments${query ? `?${query}` : ""}`;
  const { data, refetch, isLoading } = useApiQuery<{ data: Assignment[] }>(["numbering-assignments", query], url);
  const rows = (data?.data || []) as Assignment[];

  const moduleKeys = useMemo(
    () => Array.from(new Set(schemes.map((s) => s.moduleKey))).sort(),
    [schemes],
  );

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">المسار</Label>
          <Select value={filters.moduleKey || "all"} onValueChange={(v) => setFilters({ ...filters, moduleKey: v === "all" ? undefined : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {moduleKeys.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الحالة</Label>
          <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? undefined : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="assigned">مخصص</SelectItem>
              <SelectItem value="reserved">محجوز</SelectItem>
              <SelectItem value="voided">ملغي</SelectItem>
              <SelectItem value="cancelled">تم الإلغاء</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">بحث (رقم / جدول)</Label>
          <Input value={filters.q || ""} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="مثال: REQ-MK-2026" dir="ltr" className="font-mono" />
        </div>
      </CardContent></Card>

      {isLoading ? <LoadingSpinner /> : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-subtle">
                <th className="p-3 text-start">الرقم</th>
                <th className="p-3 text-start">السياسة</th>
                <th className="p-3 text-start">الجدول</th>
                <th className="p-3 text-start">المعرف</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">تاريخ الإصدار</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-surface-subtle">
                  <td className="p-3 font-mono font-semibold">{r.number}</td>
                  <td className="p-3">{r.schemeName || `${r.moduleKey}.${r.entityKey}`}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{r.entityTable}</td>
                  <td className="p-3">{r.entityId ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={r.status === "voided" ? "destructive" : r.status === "reserved" ? "secondary" : "default"} className="text-xs">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDateAr(r.issuedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                  لا توجد أرقام صادرة بهذه المعايير
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}

// ─── Audit log panel ─────────────────────────────────────────────

function AuditPanel() {
  const { data, isLoading } = useApiQuery<{ data: AuditRow[] }>(["numbering-audit"], "/numbering/audit");
  const rows = (data?.data || []) as AuditRow[];

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-surface-subtle">
            <th className="p-3 text-start">الإجراء</th>
            <th className="p-3 text-start">السياسة / الرقم</th>
            <th className="p-3 text-start">قبل / بعد</th>
            <th className="p-3 text-start">السبب</th>
            <th className="p-3 text-start">المستخدم</th>
            <th className="p-3 text-start">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b hover:bg-surface-subtle align-top">
              <td className="p-3">
                <Badge variant="outline" className="text-xs font-mono">{r.action}</Badge>
              </td>
              <td className="p-3 text-xs">
                {r.schemeName && <div>{r.schemeName}</div>}
                {r.entityTable && <div className="font-mono text-muted-foreground">{r.entityTable}#{r.entityId ?? "—"}</div>}
              </td>
              <td className="p-3 text-xs font-mono max-w-xs whitespace-pre-wrap">
                <div className="text-status-error-foreground">{r.before ? JSON.stringify(r.before) : "—"}</div>
                <div className="text-status-success-foreground">{r.after ? JSON.stringify(r.after) : "—"}</div>
              </td>
              <td className="p-3 text-xs">{r.reason || "—"}</td>
              <td className="p-3 text-xs">{r.actorName || "—"}</td>
              <td className="p-3 text-xs text-muted-foreground">{formatDateAr(r.createdAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              لا توجد سجلات تدقيق
            </td></tr>
          )}
        </tbody>
      </table>
    </CardContent></Card>
  );
}
