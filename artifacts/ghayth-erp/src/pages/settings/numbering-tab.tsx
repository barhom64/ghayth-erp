// Settings → إعدادات الترقيم (Issue #1141)
//
// Simplified end-user UX (replaces the previous dialog-based version):
//   * NO popup dialogs — the whole tab uses an inline master/detail
//     layout. Selecting a policy expands an editor card right below
//     it (or in the side panel on wide screens).
//   * Three picker buttons replace the technical fields. The user
//     picks "كل فرع رقم مستقل" / "رقم واحد للشركة" / "حسب الموسم"
//     and the corresponding pattern/scope/reset values are written
//     for them. No need to understand the {PREFIX}-{BRANCH}-{SEQ}
//     vocabulary.
//   * A live preview shows exactly what the next number will look
//     like ("الرقم القادم: REQ-MK-2026-0001") so the operator can
//     see the effect of their change before saving.
//   * "إعدادات متقدمة" toggle reveals the raw pattern / padLength /
//     issueTiming / manualEditPolicy fields for experts that need
//     them.
//   * NEW backfill banner — when the scheme has legacy refs from
//     before the unified center launched, a one-click "جرد المعاملات
//     السابقة" button inventories them into `numbering_assignments`
//     and bumps the counter past the highest existing sequence.

import { useState, useMemo, Component, type ErrorInfo } from "react";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Hash, Lock, Unlock, RotateCcw, Edit, History,
  Building2, Building, Moon, Globe, Sparkles, AlertTriangle, ChevronDown, ChevronUp, X, CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
  defaultEntityTable: string | null;
  defaultRefColumn: string | null;
  lastBackfillAt: string | null;
  lastBackfillCount: number | null;
  assignmentCount: number;
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

// ─── Three simple presets that map to (scope, reset, pattern) ──────

type PresetKey = "per_branch_yearly" | "company_yearly" | "per_season";

interface Preset {
  key: PresetKey;
  label: string;
  description: string;
  icon: typeof Building;
  scopePolicy: string;
  resetPolicy: string;
  pattern: string;
}

const PRESETS: Preset[] = [
  {
    key: "per_branch_yearly",
    label: "كل فرع رقم مستقل (سنوي)",
    description: "مكة: REQ-MK-2026-0001، جدة: REQ-JED-2026-0001 — التسلسل يتجدد كل سنة لكل فرع.",
    icon: Building,
    scopePolicy: "branch",
    resetPolicy: "yearly",
    pattern: "{PREFIX}-{BRANCH}-{YYYY}-{SEQ}",
  },
  {
    key: "company_yearly",
    label: "رقم واحد للشركة (سنوي)",
    description: "INV-2026-0001 يشترك بين كل الفروع — مناسب للفواتير المالية والقيود.",
    icon: Building2,
    scopePolicy: "company",
    resetPolicy: "yearly",
    pattern: "{PREFIX}-{YYYY}-{SEQ}",
  },
  {
    key: "per_season",
    label: "حسب الموسم (عمرة)",
    description: "UMG-1447-MK-0001 — تسلسل مستقل لكل موسم.",
    icon: Moon,
    scopePolicy: "season",
    resetPolicy: "seasonal",
    pattern: "{PREFIX}-{SEASON}-{BRANCH}-{SEQ}",
  },
];

function detectPreset(scheme: Scheme): PresetKey | "custom" {
  for (const p of PRESETS) {
    if (
      p.scopePolicy === scheme.scopePolicy &&
      p.resetPolicy === scheme.resetPolicy &&
      p.pattern === scheme.pattern
    ) {
      return p.key;
    }
  }
  return "custom";
}

const EDIT_POLICY_LABELS: Record<string, string> = {
  disabled: "ممنوع تعديل الرقم نهائيًا",
  draft_only: "السماح بالتعديل قبل الاعتماد فقط",
  privileged: "بصلاحية خاصة فقط",
  legacy_import_only: "أثناء استيراد البيانات القديمة فقط",
};

const TIMING_LABELS: Record<string, string> = {
  on_draft: "عند إنشاء المسودة",
  on_submit: "عند التقديم",
  on_approval: "عند الاعتماد",
  on_posting: "عند الترحيل",
};

// ─── Main tab component ─────────────────────────────────────────

export function NumberingTab() {
  const { data, refetch, isLoading, isError, error } = useApiQuery<{ data: Scheme[] }>(
    ["numbering-schemes"], "/numbering/schemes",
  );
  const schemes = asList<Scheme>(data);
  const { toast } = useToast();

  // POST /numbering/backfill-all — runs the backfill across every
  // scheme that has legacy refs lingering in the assignments table.
  // The per-scheme button still exists; this is the "do them all" shortcut.
  const backfillAllMut = useApiMutation<unknown, Record<string, never>>(
    "/numbering/backfill-all",
    "POST",
    [["numbering-assignments"], ["numbering-schemes"]],
    { successMessage: "تم تشغيل الجرد على كل السياسات" },
  );
  const [backfillOpen, setBackfillOpen] = useState(false);

  // GET /numbering/scheme-lookup?moduleKey=X&entityKey=Y — server
  // resolves the active scheme for a given (module, entity) pair.
  // Useful for verifying which policy will issue the next code for a
  // module before triggering a backfill or override.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupModule, setLookupModule] = useState("");
  const [lookupEntity, setLookupEntity] = useState("");
  const lookupReady = lookupModule.trim().length > 0 && lookupEntity.trim().length > 0;
  const lookupQ = useApiQuery<any>(
    ["numbering-scheme-lookup", lookupModule.trim(), lookupEntity.trim()],
    lookupReady
      ? `/numbering/scheme-lookup?moduleKey=${encodeURIComponent(lookupModule.trim())}&entityKey=${encodeURIComponent(lookupEntity.trim())}`
      : null,
    { enabled: lookupOpen && lookupReady },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Hash className="w-5 h-5 text-status-info" />
          إعدادات الترقيم الموحد
        </h3>
        <div className="flex items-center gap-2">
          <GuardedButton perm="admin:update" variant="outline" size="sm" onClick={() => setLookupOpen(true)}>
            بحث عن رقم
          </GuardedButton>
          <GuardedButton perm="admin:update" variant="outline" size="sm" onClick={() => setBackfillOpen(true)}>
            جرد شامل
          </GuardedButton>
          <Badge variant="outline" className="text-xs">
            {schemes.length} نوع معاملة
          </Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        يحدد هذا المركز كيف يصدر النظام أرقام كل المعاملات (الطلبات، الفواتير، السندات، العقود، …)
        لكل نوع معاملة اختر كيف يتم الترقيم: مستقل لكل فرع، موحد للشركة، أو حسب الموسم — والنظام يتولى الباقي.
      </p>

      <Tabs defaultValue="policies" dir="rtl">
        <TabsList>
          <TabsTrigger value="policies">السياسات</TabsTrigger>
          <TabsTrigger value="assignments">سجل الأرقام</TabsTrigger>
          <TabsTrigger value="audit">سجل التدقيق</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <PoliciesPanel schemes={schemes} onChange={refetch} />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsPanel schemes={schemes} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>

      {backfillOpen && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">جرد ترقيم شامل</p>
            <p className="text-xs text-muted-foreground">
              سيتم جرد جميع المعاملات السابقة عبر كل السياسات. قد تستغرق العملية وقتاً
              على القواعد الكبيرة.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBackfillOpen(false)}>إلغاء</Button>
              <Button
                size="sm"
                onClick={() => {
                  backfillAllMut.mutate({}, { onSuccess: () => { setBackfillOpen(false); refetch(); } });
                }}
                disabled={backfillAllMut.isPending}
              >
                {backfillAllMut.isPending ? "جاري التشغيل..." : "تشغيل الجرد"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lookupOpen && (
        <Card className="border-status-info-surface bg-status-info-surface/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">بحث عن سياسة الترقيم</p>
              <Button variant="ghost" size="sm" onClick={() => { setLookupOpen(false); setLookupModule(""); setLookupEntity(""); }}>
                إغلاق
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">moduleKey</Label>
                <Input
                  value={lookupModule}
                  onChange={(e) => setLookupModule(e.target.value)}
                  placeholder="finance"
                  dir="ltr"
                  className="font-mono h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">entityKey</Label>
                <Input
                  value={lookupEntity}
                  onChange={(e) => setLookupEntity(e.target.value)}
                  placeholder="invoice"
                  dir="ltr"
                  className="font-mono h-8 text-xs"
                />
              </div>
            </div>
            {lookupQ.isLoading && <p className="text-xs text-muted-foreground">جاري البحث...</p>}
            {lookupQ.isError && <p className="text-xs text-muted-foreground">لم يُعثر على سياسة بهذه المفاتيح.</p>}
            {lookupQ.data && (
              <div className="border rounded p-2 text-xs space-y-1 bg-white">
                <p><span className="text-muted-foreground">الاسم:</span> {lookupQ.data.name ?? "—"}</p>
                <p><span className="text-muted-foreground">القالب:</span> <span className="font-mono">{lookupQ.data.template ?? lookupQ.data.format ?? "—"}</span></p>
                <p><span className="text-muted-foreground">التتابع الحالي:</span> {lookupQ.data.currentSequence ?? lookupQ.data.lastSequence ?? "—"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Policies panel (master + inline editor) ────────────────────

function PoliciesPanel({ schemes, onChange }: { schemes: Scheme[]; onChange: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = schemes.find((s) => s.id === selectedId) || null;

  // Scroll the inline editor into view when a row is expanded so users
  // never wonder why "the arrow moved but nothing happened". Without
  // this the editor renders below the fold on long tables.
  const editorRef = (el: HTMLDivElement | null) => {
    if (el && selected) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-subtle">
              <th className="p-3 text-start">نوع المعاملة</th>
              <th className="p-3 text-start">طريقة الترقيم</th>
              <th className="p-3 text-start">مثال الرقم</th>
              <th className="p-3 text-start">عدد الأرقام الصادرة</th>
              <th className="p-3 text-start">الحالة</th>
              <th className="p-3 text-end w-32"></th>
            </tr>
          </thead>
          <tbody>
            {schemes.map((s) => {
              const preset = detectPreset(s);
              const presetDef = PRESETS.find((p) => p.key === preset);
              const isSelected = selectedId === s.id;
              const toggle = () => setSelectedId(isSelected ? null : s.id);
              return (
                <tr
                  key={s.id}
                  className={cn(
                    "border-b hover:bg-surface-subtle cursor-pointer",
                    isSelected && "bg-status-info-surface/30"
                  )}
                  onClick={toggle}
                >
                  <td className="p-3">
                    <div className="font-medium">{s.displayNameAr}</div>
                  </td>
                  <td className="p-3 text-sm">
                    {presetDef ? presetDef.label : <span className="text-muted-foreground">مخصص</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-status-info-foreground">
                    {samplePreview(s)}
                  </td>
                  <td className="p-3 text-sm">{(s.assignmentCount ?? 0).toLocaleString("ar-SA")}</td>
                  <td className="p-3">
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                      {s.isActive ? "نشطة" : "متوقفة"}
                    </Badge>
                  </td>
                  <td className="p-3 text-end">
                    {/* Explicit button so the click target is unambiguous; the
                        whole row still toggles, but a clear button label cures
                        "the chevron moved but nothing opened" confusion. */}
                    <Button
                      variant={isSelected ? "default" : "ghost"}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); toggle(); }}
                    >
                      {isSelected ? (
                        <><ChevronUp className="h-4 w-4 me-1" /> إغلاق</>
                      ) : (
                        <><Edit className="h-4 w-4 me-1" /> تعديل</>
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {schemes.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                لا توجد سياسات ترقيم
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>

      {selected && (
        <div ref={editorRef}>
          <SchemeEditorBoundary
            key={selected.id}
            scheme={selected}
            onClose={() => setSelectedId(null)}
            onSaved={() => { onChange(); }}
          />
        </div>
      )}
    </div>
  );
}

// Tiny error boundary so a render-time exception inside SchemeEditor
// (bad data shape, missing field, etc) surfaces an actionable message
// instead of silently collapsing the editor to nothing.
class SchemeEditorBoundary extends Component<
  { scheme: Scheme; onClose: () => void; onSaved: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[NumberingTab] SchemeEditor crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <Card className="border-status-error">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-status-error-foreground font-medium">
              <AlertTriangle className="h-4 w-4" />
              تعذّر فتح محرر سياسة الترقيم
            </div>
            <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
            <Button variant="ghost" size="sm" onClick={this.props.onClose}>إغلاق</Button>
          </CardContent>
        </Card>
      );
    }
    return <SchemeEditor {...this.props} />;
  }
}

/** Build a quick text-only sample of what the next number would look like.
 *  The "year" used in the {YYYY} substitution is best-effort — this is a
 *  client-side label only; the real number is allocated server-side using
 *  the Asia/Riyadh timezone. utc-ok: client-side label preview only.
 */
function samplePreview(s: Scheme): string {
  const year = new Date().getFullYear(); // utc-ok: client-side display string; the server uses currentYear() in Asia/Riyadh.
  // Defensive: pad/pattern/prefix may be undefined when the API row
  // predates migration 213 — fall back to safe defaults so the row
  // renders a sensible preview instead of crashing the table.
  const pad = Math.max(1, Math.min(10, Number(s.padLength) || 4));
  const seq = String(1).padStart(pad, "0");
  const pattern = s.pattern || "{PREFIX}-{YYYY}-{SEQ}";
  const prefix = s.prefix || "REF";
  return pattern
    .replace("{PREFIX}", prefix)
    .replace("{BRANCH}", "BR")
    .replace("{YYYY}", String(year))
    .replace("{YY}", String(year).slice(2))
    .replace("{MM}", "01")
    .replace("{SEASON}", "1447")
    .replace("{SEQ}", seq);
}

// ─── Inline scheme editor (replaces the old dialog) ─────────────

function SchemeEditor({
  scheme,
  onClose,
  onSaved,
}: {
  scheme: Scheme;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const initialPreset = detectPreset(scheme);

  const [presetKey, setPresetKey] = useState<PresetKey | "custom">(initialPreset);
  // Defensive defaults — `scheme` arrives from the API and any field
  // could be null/undefined if the row predates migration 213. Without
  // these fallbacks the controlled <Input value={null}> warning fires
  // and the editor renders blank instead of crashing the boundary.
  const [prefix, setPrefix] = useState(scheme.prefix ?? "");
  const [pattern, setPattern] = useState(scheme.pattern ?? "{PREFIX}-{YYYY}-{SEQ}");
  const [padLength, setPadLength] = useState(scheme.padLength ?? 4);
  const [scopePolicy, setScopePolicy] = useState(scheme.scopePolicy ?? "company");
  const [resetPolicy, setResetPolicy] = useState(scheme.resetPolicy ?? "yearly");
  const [manualEditPolicy, setManualEditPolicy] = useState(scheme.manualEditPolicy ?? "disabled");
  const [isActive, setIsActive] = useState(scheme.isActive ?? true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reason, setReason] = useState("");

  // Live preview
  const previewQuery = useApiQuery<{ number: string }>(
    ["numbering-preview-live", String(scheme.id), prefix, pattern, String(padLength), scopePolicy, resetPolicy],
    `/numbering/preview?moduleKey=${scheme.moduleKey}&entityKey=${scheme.entityKey}`,
  );
  const previewNumber = previewQuery.data?.number || samplePreview({
    ...scheme,
    prefix, pattern, padLength, scopePolicy, resetPolicy,
  });

  const handlePreset = (key: PresetKey) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setPresetKey(key);
    setScopePolicy(p.scopePolicy);
    setResetPolicy(p.resetPolicy);
    setPattern(p.pattern);
  };

  const saveMut = useApiMutation<any, Record<string, unknown>>(
    `/numbering/schemes/${scheme.id}`, "PATCH",
    [["numbering-schemes"]],
    {
      successMessage: "تم حفظ السياسة",
      onSuccess: () => {
        onSaved();
        onClose();
      },
    },
  );

  const handleSave = () => {
    if (reason.trim().length < 3) {
      toast({ title: "السبب مطلوب", description: "اكتب سبب التعديل (3 أحرف على الأقل)" });
      return;
    }
    saveMut.mutate({
      prefix,
      pattern,
      padLength,
      scopePolicy,
      resetPolicy,
      manualEditPolicy,
      isActive,
      reason,
    });
  };

  return (
    <Card className="border-status-info">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Edit className="h-4 w-4" />
          {scheme.displayNameAr}
          <span className="text-xs text-muted-foreground font-mono ms-2">
            {scheme.moduleKey}.{scheme.entityKey}
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} title="إغلاق">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Backfill banner */}
        <BackfillBanner scheme={scheme} onDone={onSaved} />

        {/* Live preview */}
        <div className="rounded-lg border-2 border-status-info border-dashed bg-status-info-surface/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">الرقم القادم سيكون:</div>
          <div className="text-2xl font-mono font-bold tracking-wider text-status-info-foreground" dir="ltr">
            {previewNumber}
          </div>
        </div>

        {/* Step 1 — choose preset */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">١ — اختر طريقة الترقيم:</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const active = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePreset(p.key)}
                  className={cn(
                    "text-start rounded-lg border-2 p-3 transition-colors",
                    active
                      ? "border-status-info bg-status-info-surface/40"
                      : "border-border hover:bg-surface-subtle",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <Icon className="h-4 w-4" />
                    {p.label}
                    {active && <CheckCircle className="h-4 w-4 ms-auto text-status-info" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </button>
              );
            })}
          </div>
          {presetKey === "custom" && (
            <div className="text-xs text-status-warning-foreground bg-status-warning-surface/30 rounded-md p-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              السياسة الحالية مخصصة (لا تطابق أي قالب جاهز). يمكنك إبقاؤها أو اختيار قالب جاهز من الأعلى.
            </div>
          )}
        </div>

        {/* Step 2 — basics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-sm">٢ — البادئة (اختصار النوع)</Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="REQ / INV / CTR"
              dir="ltr"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              مثال: <span className="font-mono">REQ</span> للطلبات،
              <span className="font-mono"> INV</span> للفواتير
            </p>
          </div>
          <div>
            <Label className="text-sm">٣ — متى تعديل الرقم يدويًا؟</Label>
            <Select value={manualEditPolicy} onValueChange={setManualEditPolicy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EDIT_POLICY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center justify-between rounded-lg border bg-surface-subtle/40 p-3">
          <div>
            <Label className="text-sm font-medium">السياسة نشطة</Label>
            <p className="text-xs text-muted-foreground">
              إيقاف السياسة يمنع إصدار أرقام جديدة لهذا النوع — لكن لا يحذف الأرقام السابقة.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>

        {/* Advanced toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-sm text-status-info-foreground flex items-center gap-1 hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            إعدادات متقدمة (للخبراء)
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-surface-subtle/30 rounded-lg p-3 border">
              <div>
                <Label className="text-xs">نمط الرقم</Label>
                <Input
                  value={pattern}
                  onChange={(e) => { setPattern(e.target.value); setPresetKey("custom"); }}
                  dir="ltr"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  الرموز: <code>{"{PREFIX}"}</code> <code>{"{BRANCH}"}</code> <code>{"{YYYY}"}</code> <code>{"{YY}"}</code> <code>{"{MM}"}</code> <code>{"{SEASON}"}</code> <code>{"{SEQ}"}</code>
                </p>
              </div>
              <div>
                <Label className="text-xs">طول الرقم (أصفار)</Label>
                <Input
                  type="number" min={3} max={10}
                  value={padLength}
                  onChange={(e) => setPadLength(Number(e.target.value) || 4)}
                />
              </div>
              <div>
                <Label className="text-xs">توقيت إصدار الرقم</Label>
                <Select value={scheme.issueTiming} disabled onValueChange={() => { /* enforced by route — see note */ }}>
                  <SelectTrigger><SelectValue placeholder={TIMING_LABELS[scheme.issueTiming]} /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIMING_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  هذا التوقيت مربوط بكود المسار — تغييره بدون تعديل المسار سيمنع إصدار الأرقام الجديدة (خطأ بالعربية يبيّن السبب).
                </p>
              </div>
              <div>
                <Label className="text-xs">آخر تعديل</Label>
                <div className="text-xs text-muted-foreground p-2">{formatDateAr(scheme.updatedAt)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Reason + Save */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-sm">سبب التعديل (إلزامي)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="مثال: تغيير البادئة بعد توحيد المسميات في الإدارة"
          />
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saveMut.isPending} rateLimitAware>
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          </div>
        </div>

        {/* Counters strip */}
        <CountersStrip schemeId={scheme.id} />
      </CardContent>
    </Card>
  );
}

// ─── Backfill banner ─────────────────────────────────────────────

function BackfillBanner({ scheme, onDone }: { scheme: Scheme; onDone: () => void }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const { data: preview, refetch } = useApiQuery<{ pending: number; alreadyAssigned: number }>(
    ["numbering-backfill-preview", String(scheme.id)],
    `/numbering/schemes/${scheme.id}/backfill/preview`,
  );

  if (!preview || (preview.pending === 0 && preview.alreadyAssigned > 0)) {
    return scheme.lastBackfillAt ? (
      <div className="rounded-lg border bg-status-success-surface/30 p-3 text-xs text-status-success-foreground flex items-center gap-2">
        <CheckCircle className="h-4 w-4" />
        تم جرد المعاملات السابقة ({scheme.lastBackfillCount?.toLocaleString("ar-SA") || 0} معاملة) بتاريخ {formatDateAr(scheme.lastBackfillAt)}.
      </div>
    ) : null;
  }

  const handleBackfill = async () => {
    setRunning(true);
    try {
      const result = await apiFetch<any>(`/numbering/schemes/${scheme.id}/backfill`, { method: "POST" });
      toast({
        title: "تم الجرد",
        description: `تم تسجيل ${result.imported} معاملة قديمة. سيبدأ التسلسل القادم من ${result.nextSequenceAfterBackfill}.`,
      });
      refetch();
      onDone();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الجرد", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-status-warning bg-status-warning-surface/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-status-warning-foreground shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium text-status-warning-foreground">
            توجد {preview.pending.toLocaleString("ar-SA")} معاملة قديمة بلا تتبّع
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            هذه المعاملات أُنشئت قبل تفعيل مركز الترقيم الموحد، فلا تظهر في سجل الأرقام
            ولا في التدقيق. الجرد سيسجلها مرة واحدة ويحدّث العداد بحيث لا يتعارض
            الرقم القادم مع رقم قديم. العملية آمنة ولا تعدّل أي بيانات في المعاملات نفسها.
          </p>
        </div>
      </div>
      <div>
        <GuardedButton
          perm="settings.numbering.reset:update"
          size="sm"
          onClick={handleBackfill}
          disabled={running}
          rateLimitAware
        >
          {running ? "جاري الجرد..." : `جرد ${preview.pending.toLocaleString("ar-SA")} معاملة`}
        </GuardedButton>
      </div>
    </div>
  );
}

// ─── Counters strip (inline replacement for the dialog) ────────────

function CountersStrip({ schemeId }: { schemeId: number }) {
  const { toast } = useToast();
  const { data, refetch, isLoading } = useApiQuery<{ data: Scheme; counters: Counter[] }>(
    ["numbering-scheme-detail", String(schemeId)],
    `/numbering/schemes/${schemeId}`,
  );
  const counters = (data?.counters || []) as Counter[];
  // Inline state for reset / lock forms (replaces 3 window.prompt calls).
  // Only one form is open at a time per row, so we keep a single
  // `mode` discriminator plus the counter id.
  const [actionMode, setActionMode] = useState<"reset" | "lock" | null>(null);
  const [actionCounterId, setActionCounterId] = useState<number | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [resetNewValue, setResetNewValue] = useState("1");
  const closeForm = () => { setActionMode(null); setActionCounterId(null); setActionReason(""); setResetNewValue("1"); };

  if (isLoading) return null;
  if (counters.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic border-t pt-3">
        لم يصدر أي رقم بعد لهذه السياسة — العداد سيبدأ من 1 لأول إصدار.
      </div>
    );
  }

  const handleReset = (counterId: number) => {
    setActionMode("reset");
    setActionCounterId(counterId);
    setActionReason("");
    setResetNewValue("1");
  };
  const confirmReset = async () => {
    if (actionCounterId == null) return;
    if (!actionReason.trim() || actionReason.trim().length < 3) {
      toast({ title: "السبب مطلوب", description: "السبب لا يقل عن 3 أحرف" });
      return;
    }
    const newValue = Number(resetNewValue);
    if (!Number.isFinite(newValue) || newValue < 0) {
      toast({ title: "قيمة غير صالحة", description: "أدخل رقماً صحيحاً ≥ 0", variant: "destructive" });
      return;
    }
    const cid = actionCounterId;
    const reason = actionReason.trim();
    closeForm();
    try {
      await apiFetch(`/numbering/counters/${cid}/reset`, {
        method: "POST",
        body: JSON.stringify({ newValue, reason }),
      });
      toast({ title: "تم التصفير" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل التصفير", variant: "destructive" });
    }
  };

  const handleLockToggle = (counter: Counter) => {
    setActionMode("lock");
    setActionCounterId(counter.id);
    setActionReason("");
  };
  const confirmLockToggle = async () => {
    if (actionCounterId == null) return;
    const counter = counters.find((c) => c.id === actionCounterId);
    if (!counter) { closeForm(); return; }
    if (!actionReason.trim() || actionReason.trim().length < 3) {
      toast({ title: "السبب مطلوب", description: "السبب لا يقل عن 3 أحرف" });
      return;
    }
    const op = counter.lockedAt ? "unlock" : "lock";
    const reason = actionReason.trim();
    closeForm();
    try {
      await apiFetch(`/numbering/counters/${counter.id}/${op}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      toast({ title: counter.lockedAt ? "تم الفتح" : "تم القفل" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    }
  };

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="text-sm font-medium flex items-center gap-2">
        <Hash className="h-4 w-4" /> العدادات الفعلية
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-start">الفرع</th>
              <th className="p-2 text-start">السنة</th>
              <th className="p-2 text-start">الموسم</th>
              <th className="p-2 text-start">آخر رقم صدر</th>
              <th className="p-2 text-start">القادم</th>
              <th className="p-2 text-start">الحالة</th>
              <th className="p-2 text-end">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {counters.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-2">{c.branchId ?? "—"}</td>
                <td className="p-2">{c.fiscalYear ?? "—"}</td>
                <td className="p-2">{c.seasonId ?? "—"}</td>
                <td className="p-2 font-mono">{c.lastNumber}</td>
                <td className="p-2 font-mono font-semibold text-status-info-foreground">{c.nextNumber}</td>
                <td className="p-2">
                  {c.lockedAt ? (
                    <Badge variant="destructive" className="text-xs">مقفول</Badge>
                  ) : (
                    <Badge className="text-xs">نشط</Badge>
                  )}
                </td>
                <td className="p-2 text-end">
                  <GuardedButton
                    perm="settings.numbering.reset:update"
                    variant="ghost"
                    size="sm"
                    title="تصفير"
                    onClick={() => handleReset(c.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </GuardedButton>
                  <GuardedButton
                    perm="settings.numbering:update"
                    variant="ghost"
                    size="sm"
                    title={c.lockedAt ? "فتح القفل" : "قفل العداد"}
                    onClick={() => handleLockToggle(c)}
                  >
                    {c.lockedAt ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </GuardedButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {actionMode && actionCounterId !== null && (
        <div className="border-t pt-2 mt-2 space-y-2 bg-surface-subtle/40 rounded p-2">
          <div className="text-xs font-medium">
            {actionMode === "reset" ? "تصفير العداد" :
              counters.find((c) => c.id === actionCounterId)?.lockedAt ? "فتح قفل العداد" : "قفل العداد"}
          </div>
          {actionMode === "reset" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">القيمة الجديدة:</span>
              <Input
                type="number"
                inputMode="numeric"
                value={resetNewValue}
                onChange={(e) => setResetNewValue(e.target.value)}
                className="h-7 w-24 text-xs"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">السبب (≥ 3 أحرف):</span>
            <Input
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
            <Button
              size="sm"
              onClick={actionMode === "reset" ? confirmReset : confirmLockToggle}
              disabled={actionReason.trim().length < 3}
              rateLimitAware
            >
              تأكيد
            </Button>
            <Button size="sm" variant="outline" onClick={closeForm}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assignments panel ──────────────────────────────────────────

function AssignmentsPanel({ schemes }: { schemes: Scheme[] }) {
  const [filters, setFilters] = useState<{ moduleKey?: string; status?: string; q?: string }>({});
  const query = useMemo(() => {
    const u = new URLSearchParams();
    if (filters.moduleKey) u.set("moduleKey", filters.moduleKey);
    if (filters.status) u.set("status", filters.status);
    if (filters.q) u.set("q", filters.q);
    return u.toString();
  }, [filters]);
  const { data, isLoading, refetch } = useApiQuery<{ data: Assignment[] }>(
    ["numbering-assignments", query],
    `/numbering/assignments${query ? `?${query}` : ""}`,
  );
  const rows = (data?.data || []) as Assignment[];
  const moduleKeys = useMemo(
    () => Array.from(new Set(schemes.map((s) => s.moduleKey))).sort(),
    [schemes],
  );
  const { toast } = useToast();
  // Override + void are admin-only repair operations — wrap each in an
  // inline prompt-and-fire helper instead of building a dialog. Both
  // POST to /numbering/assignments/:id/{override,void} with a {reason}
  // body; void also takes {newNumber} when overriding. Backend enforces
  // settings.numbering.override authorize, so the prompt is mostly UX
  // (operator confirmation + reason capture).
  // Override + void actions live as inline Cards driven by overrideRow /
  // voidRow state below — the previous overrideAssignment / voidAssignment
  // window.prompt handlers were dead code (no caller after the inline-card
  // refactor) and have been removed.

  // POST /numbering/assignments/:id/override — manually rewrite the
  // issued number (e.g. correct a typo before the document is delivered).
  // POST /numbering/assignments/:id/void — invalidate an issued number
  // and free the position for the next request. Both audited.
  const overrideMut = useApiMutation<unknown, { id: number; newNumber: string; reason: string }>(
    (b) => `/numbering/assignments/${b.id}/override`,
    "POST",
    [["numbering-assignments"]],
    { successMessage: "تم تعديل الرقم", onSuccess: () => refetch() },
  );
  const voidMut = useApiMutation<unknown, { id: number; reason: string }>(
    (b) => `/numbering/assignments/${b.id}/void`,
    "POST",
    [["numbering-assignments"]],
    { successMessage: "تم إلغاء الرقم", onSuccess: () => refetch() },
  );
  const [overrideRow, setOverrideRow] = useState<Assignment | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [reason, setReason] = useState("");
  const submitOverride = () => {
    if (!overrideRow) return;
    const r = reason.trim();
    if (!newNumber.trim()) return;
    // Server requires reason min 3 chars — surface the constraint
    // before the request goes out.
    if (r.length < 3) return;
    overrideMut.mutate(
      { id: overrideRow.id, newNumber: newNumber.trim(), reason: r },
      { onSuccess: () => { setOverrideRow(null); setNewNumber(""); setReason(""); } },
    );
  };
  const [voidRow, setVoidRow] = useState<Assignment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const submitVoid = () => {
    if (!voidRow) return;
    const r = voidReason.trim();
    if (r.length < 3) return;
    voidMut.mutate(
      { id: voidRow.id, reason: r },
      { onSuccess: () => { setVoidRow(null); setVoidReason(""); } },
    );
  };

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
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
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">بحث (رقم / جدول)</Label>
          <Input
            value={filters.q || ""}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="مثال: REQ-MK-2026"
            dir="ltr"
            className="font-mono"
          />
        </div>
      </CardContent></Card>

      {isLoading ? <LoadingSpinner /> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-subtle">
                <th className="p-3 text-start">الرقم</th>
                <th className="p-3 text-start">السياسة</th>
                <th className="p-3 text-start">الجدول</th>
                <th className="p-3 text-start">المعرف</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">تاريخ الإصدار</th>
                <th className="p-3 text-start">إجراءات</th>
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
                    <Badge variant={r.status === "voided" ? "destructive" : "default"} className="text-xs">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDateAr(r.issuedAt)}</td>
                  <td className="p-3">
                    {r.status !== "voided" && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setOverrideRow(r); setNewNumber(r.number); setReason(""); }}
                        >
                          تعديل
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs text-status-error-foreground"
                          onClick={() => { setVoidRow(r); setVoidReason(""); }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                  لا توجد أرقام مسجلة بهذه المعايير
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {overrideRow && (
        <Card className="border-status-info-surface bg-status-info-surface/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">تعديل رقم #{overrideRow.id}</p>
              <Button variant="ghost" size="sm" onClick={() => setOverrideRow(null)}>إغلاق</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">الرقم الحالي</Label>
                <Input value={overrideRow.number} disabled dir="ltr" className="font-mono" />
              </div>
              <div>
                <Label className="text-xs">الرقم الجديد *</Label>
                <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} dir="ltr" className="font-mono" />
              </div>
              <div>
                <Label className="text-xs">السبب * (3 أحرف على الأقل)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={submitOverride}
                disabled={overrideMut.isPending || !newNumber.trim() || reason.trim().length < 3}
                size="sm"
                rateLimitAware
              >
                حفظ التعديل
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOverrideRow(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {voidRow && (
        <Card className="border-status-error-surface bg-status-error-surface/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">إلغاء رقم #{voidRow.id} ({voidRow.number})</p>
              <Button variant="ghost" size="sm" onClick={() => setVoidRow(null)}>إغلاق</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              سيتم تعليم الرقم كـ voided، ولن يُستخدم بعد ذلك. الإجراء قابل للتدقيق.
            </p>
            <Label className="text-xs">السبب * (3 أحرف على الأقل)</Label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={submitVoid}
                disabled={voidMut.isPending || voidReason.trim().length < 3}
                rateLimitAware
              >
                تأكيد الإلغاء
              </Button>
              <Button variant="outline" size="sm" onClick={() => setVoidRow(null)}>تراجع</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Audit log panel ─────────────────────────────────────────────

function AuditPanel() {
  const { data, isLoading } = useApiQuery<{ data: AuditRow[] }>(["numbering-audit"], "/numbering/audit");
  const rows = (data?.data || []) as AuditRow[];

  // GET /numbering/health — gaps, duplicates, locked counters across
  // all schemes. Surfaced as a banner above the audit log so any
  // discrepancy is visible before the operator drills into individual
  // rows.
  const { data: healthResp } = useApiQuery<any>(
    ["numbering-health"],
    "/numbering/health",
  );
  const health = healthResp?.data ?? healthResp;
  const healthIssues = Number(health?.totalIssues ?? health?.issues ?? 0);

  if (isLoading) return <LoadingSpinner />;

  const labelFor = (action: string): string => {
    const map: Record<string, string> = {
      issue: "إصدار رقم",
      reserve: "حجز رقم",
      assign: "ربط بمستند",
      override: "تعديل يدوي",
      void: "إلغاء",
      reset_counter: "تصفير عداد",
      lock_counter: "قفل عداد",
      unlock_counter: "فتح قفل عداد",
      update_scheme: "تعديل سياسة",
      backfill: "جرد المعاملات السابقة",
    };
    return map[action] || action;
  };

  return (
    <div className="space-y-3">
      {health && (
        <Card className={healthIssues > 0 ? "border-status-warning-surface bg-status-warning-surface/30" : "border-status-success-surface bg-status-success-surface/30"}>
          <CardContent className="p-3 text-sm">
            {healthIssues > 0 ? (
              <p className="text-status-warning-foreground">
                <strong>{healthIssues}</strong> مسألة تتطلب المراجعة في مركز الترقيم.
                {health?.gaps != null && <span className="ms-3 text-xs">فجوات: {String(health.gaps)}</span>}
                {health?.duplicates != null && <span className="ms-3 text-xs">تكرارات: {String(health.duplicates)}</span>}
                {health?.lockedCounters != null && <span className="ms-3 text-xs">عدادات مقفلة: {String(health.lockedCounters)}</span>}
              </p>
            ) : (
              <p className="text-status-success-foreground">سلامة الترقيم: لا توجد مسائل مكتشفة.</p>
            )}
          </CardContent>
        </Card>
      )}
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-surface-subtle">
            <th className="p-3 text-start">الإجراء</th>
            <th className="p-3 text-start">السياسة / الرقم</th>
            <th className="p-3 text-start">السبب</th>
            <th className="p-3 text-start">المستخدم</th>
            <th className="p-3 text-start">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b hover:bg-surface-subtle align-top">
              <td className="p-3">
                <Badge variant="outline" className="text-xs">{labelFor(r.action)}</Badge>
              </td>
              <td className="p-3 text-xs">
                {r.schemeName && <div>{r.schemeName}</div>}
                {r.entityTable && (
                  <div className="font-mono text-muted-foreground">
                    {r.entityTable}{r.entityId !== null ? `#${r.entityId}` : ""}
                  </div>
                )}
              </td>
              <td className="p-3 text-xs">{r.reason || "—"}</td>
              <td className="p-3 text-xs">{r.actorName || "—"}</td>
              <td className="p-3 text-xs text-muted-foreground">{formatDateAr(r.createdAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              لا توجد سجلات تدقيق بعد
            </td></tr>
          )}
        </tbody>
      </table>
    </CardContent></Card>
    </div>
  );
}
