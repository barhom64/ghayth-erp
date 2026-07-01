/**
 * Transport Route Patterns SPA — #2079 TA-T18-04.
 *
 * SPA-only client surface for the route_pattern templates that
 * `transport-route-patterns.ts` already exposes server-side. NO new
 * endpoints, NO new RBAC, NO migration: this page consumes the
 * existing `/transport/route-patterns*` routes that ship under the
 * `fleet.bookings` feature gate.
 *
 * Why this exists: the templates are how cargo recurring schedules
 * get materialised into transport_bookings (cron + manual /materialise
 * + bulk /materialise-range). Until now the only surface was the cron
 * + curl; this page gives the dispatcher a place to:
 *
 *   • list / filter active vs paused vs archived patterns
 *   • create / edit a pattern (full field set incl. day-of-week mask,
 *     departure time, active window, route + defaults)
 *   • fire one day (/materialise) or a range (/materialise-range) and
 *     see the per-date `created` / `existed` breakdown the server
 *     already returns (idempotent — re-firing never duplicates)
 *   • soft-delete (archive) a pattern
 *
 * Strict client-side rules mirror TA-T18-05's mandate:
 *   • numbers: empty string → null (never 0)
 *   • day-of-week: 7-checkbox UI ↔ 7-bit mask (Sun bit 0..Sat bit 6)
 *   • status enum exactly matches server: active|paused|archived
 *   • all writes gated by usePermission("fleet.bookings:update|create|delete")
 */

import { useState, useMemo } from "react";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  PageStatusBadge, DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import {
  Plus, Pencil, Trash2, Play, CalendarRange, Route as RouteIcon, Truck,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── server enums (mirror, do NOT extend client-side) ─────────────── */

const STATUS_OPTIONS = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: "نشط" },
  { value: "paused", label: "متوقّف مؤقتًا" },
  { value: "archived", label: "مؤرشف" },
] as const;

const STATUS_EDIT_OPTIONS = STATUS_OPTIONS.filter((o) => o.value !== "all");

// أصناف المركبات (عائلة الحمولة) — تطابق سلّم الحمولة القانوني في الخادم
// (pickup → truck → trailer). تُعرض عربيًا وتُخزَّن بالكود الذي يطابقه الترشيح.
const VEHICLE_CLASS_OPTIONS = [
  { value: "pickup", label: "نصف نقل (بيك أب)" },
  { value: "truck", label: "شاحنة" },
  { value: "trailer", label: "مقطورة (تريلا)" },
] as const;

// أصناف الرخص — مرآة LICENSE_CLASS_OPTIONS في نموذج إنشاء السائق
// (pages/create/fleet/driver-create-form.tsx). الكود قانوني، العرض عربي.
const LICENSE_CLASS_OPTIONS = [
  { value: "private", label: "خاصة" },
  { value: "light_trans", label: "نقل خفيف" },
  { value: "medium", label: "نقل متوسط" },
  { value: "heavy", label: "نقل ثقيل" },
  { value: "public_trans", label: "نقل عام" },
  { value: "motorcycle", label: "دراجة نارية" },
  { value: "equipment", label: "معدات ثقيلة" },
] as const;

// Bit 0 = Sunday Riyadh local, ..., bit 6 = Saturday — same convention
// as the server's `matchingDatesInRange` generator + cron walker.
const DAYS_OF_WEEK: { bit: number; short: string; label: string }[] = [
  { bit: 0, short: "أحد", label: "الأحد" },
  { bit: 1, short: "إثن", label: "الاثنين" },
  { bit: 2, short: "ثلا", label: "الثلاثاء" },
  { bit: 3, short: "أرب", label: "الأربعاء" },
  { bit: 4, short: "خمي", label: "الخميس" },
  { bit: 5, short: "جمع", label: "الجمعة" },
  { bit: 6, short: "سبت", label: "السبت" },
];

/* ── data shape (from GET /transport/route-patterns) ──────────────── */

interface RoutePatternRow {
  id: number;
  patternCode: string;
  name: string;
  daysOfWeekMask: number;
  departureTime: string | null;
  activeFrom: string | null;
  activeUntil: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  fromLocationKind: string | null;
  toLocationKind: string | null;
  defaultVehicleClass: string | null;
  defaultLicenseClass: string | null;
  defaultCustomerId: number | null;
  defaultContractId: number | null;
  defaultCargoWeight: number | string | null;
  defaultCargoUnit: string | null;
  operationalWaypoints: Waypoint[] | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

// أنواع نقاط التشغيل (checkpoints) على مسار الشحن — من قانون الخادم
// (تحميل/ميزان/فحص/استراحة/وقود/تفريغ). تُعرض عربيًا وتُخزَّن بالكود.
const WAYPOINT_KIND_OPTIONS = [
  { value: "loading", label: "تحميل" },
  { value: "scale", label: "ميزان" },
  { value: "inspection", label: "فحص" },
  { value: "rest", label: "استراحة" },
  { value: "fuel", label: "وقود" },
  { value: "unloading", label: "تفريغ" },
] as const;

function waypointKindLabel(kind: string): string {
  return WAYPOINT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

interface Waypoint {
  kind: string;
  notes?: string;
}

/* ── form state (kept as strings so empty maps cleanly to null) ──── */

interface PatternFormState {
  id?: number;
  patternCode: string;
  name: string;
  daysOfWeekMask: number;
  departureTime: string;
  activeFrom: string;
  activeUntil: string;
  fromLocationText: string;
  toLocationText: string;
  defaultVehicleClass: string;
  defaultLicenseClass: string;
  defaultCargoWeight: string;
  defaultCargoUnit: string;
  operationalWaypoints: Waypoint[];
  status: "active" | "paused" | "archived";
  notes: string;
}

const EMPTY_FORM: PatternFormState = {
  patternCode: "",
  name: "",
  daysOfWeekMask: 0,
  departureTime: "",
  activeFrom: "",
  activeUntil: "",
  fromLocationText: "",
  toLocationText: "",
  defaultVehicleClass: "",
  defaultLicenseClass: "",
  defaultCargoWeight: "",
  defaultCargoUnit: "",
  operationalWaypoints: [],
  status: "active",
  notes: "",
};

// قالب «نقل ثقيل» الجاهز — قيم مُسبقة فوق EMPTY_FORM (شاحنة + رخصة نقل ثقيل +
// وحدة طن). كل القيم قابلة للتعديل من الحوار. يبقى الرمز/الأيام/المسار/الوزن
// للمستخدم (الرمز فريد لكل شركة، الأيام إلزامية، الوزن يختلف لكل رحلة).
const HEAVY_TRANSPORT_PRESET: Partial<PatternFormState> = {
  name: "نقل ثقيل",
  defaultVehicleClass: "truck",
  defaultLicenseClass: "heavy",
  defaultCargoUnit: "طن",
  // نقاط تشغيل نموذجية للنقل الثقيل — قابلة للتعديل/الحذف/الإضافة.
  operationalWaypoints: [
    { kind: "loading" }, { kind: "scale" }, { kind: "inspection" }, { kind: "unloading" },
  ],
  notes: "قالب جاهز للنقل الثقيل — شاحنة + رخصة نقل ثقيل. عدّل المسار والأيام والوزن حسب الرحلة.",
};

/** Empty string → null. Anything else → trimmed string. */
function strOrNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/** Empty string → null. Otherwise Number(v) if finite. */
function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Render a 7-bit mask as short Arabic abbreviations. */
function dayMaskLabel(mask: number): string {
  const picked = DAYS_OF_WEEK.filter((d) => (mask & (1 << d.bit)) !== 0).map((d) => d.short);
  return picked.length === 0 ? "—" : picked.join("·");
}

function statusLabel(v: string): string {
  return STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/* ── main page ────────────────────────────────────────────────────── */

export default function TransportRoutePatternsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canCreate = usePermission("fleet.bookings:create");
  const canUpdate = usePermission("fleet.bookings:update");
  const canDelete = usePermission("fleet.bookings:delete");

  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PatternFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Materialise dialogs (single-day + range) — both call existing
  // server endpoints, results rendered inline.
  const [matSingleOpen, setMatSingleOpen] = useState(false);
  const [matRangeOpen, setMatRangeOpen] = useState(false);
  const [matSubject, setMatSubject] = useState<RoutePatternRow | null>(null);
  const [matSingleDate, setMatSingleDate] = useState("");
  const [matRangeFrom, setMatRangeFrom] = useState("");
  const [matRangeTo, setMatRangeTo] = useState("");
  const [matRangeCount, setMatRangeCount] = useState("");
  const [matResult, setMatResult] = useState<{
    created: Array<{ date: string; bookingNumber: string }>;
    skipped: Array<{ date: string; reason: string }>;
  } | null>(null);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: RoutePatternRow[] }>(
    ["transport-route-patterns", statusFilter],
    `/transport/route-patterns?status=${statusFilter}`,
  );
  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const kpi = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    paused: rows.filter((r) => r.status === "paused").length,
    archived: rows.filter((r) => r.status === "archived").length,
  }), [rows]);

  /* ── open create / edit dialog ──────────────────────────────── */

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
    setDialogOpen(true);
  };

  // يفتح حوار الإنشاء مُهيّأً مسبقًا بقيم النقل الثقيل (قابلة للتعديل بالكامل).
  const openHeavyPreset = () => {
    setForm({ ...EMPTY_FORM, ...HEAVY_TRANSPORT_PRESET });
    setEditing(false);
    setDialogOpen(true);
  };

  const openEdit = (r: RoutePatternRow) => {
    setForm({
      id: r.id,
      patternCode: r.patternCode,
      name: r.name,
      daysOfWeekMask: r.daysOfWeekMask,
      departureTime: r.departureTime ?? "",
      activeFrom: r.activeFrom ?? "",
      activeUntil: r.activeUntil ?? "",
      fromLocationText: r.fromLocationText ?? "",
      toLocationText: r.toLocationText ?? "",
      defaultVehicleClass: r.defaultVehicleClass ?? "",
      defaultLicenseClass: r.defaultLicenseClass ?? "",
      defaultCargoWeight: r.defaultCargoWeight == null ? "" : String(r.defaultCargoWeight),
      defaultCargoUnit: r.defaultCargoUnit ?? "",
      operationalWaypoints: Array.isArray(r.operationalWaypoints)
        ? r.operationalWaypoints.map((w) => ({ kind: w.kind, notes: w.notes ?? "" }))
        : [],
      status: (["active", "paused", "archived"].includes(r.status)
        ? r.status
        : "active") as PatternFormState["status"],
      notes: r.notes ?? "",
    });
    setEditing(true);
    setDialogOpen(true);
  };

  /* ── save (POST or PATCH; empty fields → null) ───────────────── */

  const save = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "الاسم مطلوب" });
      return;
    }
    if (!editing && !form.patternCode.trim()) {
      toast({ variant: "destructive", title: "الرمز (patternCode) مطلوب عند الإنشاء" });
      return;
    }
    if (form.daysOfWeekMask === 0) {
      toast({
        variant: "destructive",
        title: "اختر يوم واحد على الأقل",
        description: "بدون أيام نشطة لن ينتج عن القالب أي حجز.",
      });
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        daysOfWeekMask: form.daysOfWeekMask,
        departureTime: strOrNull(form.departureTime),
        activeFrom: strOrNull(form.activeFrom),
        activeUntil: strOrNull(form.activeUntil),
        fromLocationText: strOrNull(form.fromLocationText),
        toLocationText: strOrNull(form.toLocationText),
        defaultVehicleClass: strOrNull(form.defaultVehicleClass),
        defaultLicenseClass: strOrNull(form.defaultLicenseClass),
        defaultCargoWeight: numOrNull(form.defaultCargoWeight),
        defaultCargoUnit: strOrNull(form.defaultCargoUnit),
        // نقاط التشغيل: نُسقط الصفوف بلا نوع، ونحذف الملاحظة الفارغة.
        operationalWaypoints: form.operationalWaypoints
          .filter((w) => w.kind)
          .map((w) => (w.notes?.trim() ? { kind: w.kind, notes: w.notes.trim() } : { kind: w.kind })),
        status: form.status,
        notes: strOrNull(form.notes),
      };
      if (editing) {
        await apiFetch(`/transport/route-patterns/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({ title: "تم تحديث القالب" });
      } else {
        payload.patternCode = form.patternCode.trim();
        await apiFetch("/transport/route-patterns", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ title: "تم إنشاء القالب" });
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["transport-route-patterns"] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: editing ? "تعذّر التحديث" : "تعذّر الإنشاء",
        description: getErrorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  };

  /* ── soft-delete (archives via server's DELETE) ──────────────── */

  const archive = async (r: RoutePatternRow) => {
    if (!confirm(`أرشفة القالب "${r.patternCode}"؟ سيتوقّف توليد الحجوزات منه.`)) return;
    try {
      await apiFetch(`/transport/route-patterns/${r.id}`, { method: "DELETE" });
      toast({ title: "تمت الأرشفة" });
      qc.invalidateQueries({ queryKey: ["transport-route-patterns"] });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّرت الأرشفة", description: getErrorMessage(err) });
    }
  };

  /* ── materialise (single + range) ────────────────────────────── */

  const openMatSingle = (r: RoutePatternRow) => {
    setMatSubject(r);
    setMatSingleDate("");
    setMatResult(null);
    setMatSingleOpen(true);
  };
  const openMatRange = (r: RoutePatternRow) => {
    setMatSubject(r);
    setMatRangeFrom("");
    setMatRangeTo("");
    setMatRangeCount("");
    setMatResult(null);
    setMatRangeOpen(true);
  };

  const fireSingle = async () => {
    if (!matSubject) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      const t = strOrNull(matSingleDate);
      if (t) body.targetDate = t;
      const resp = await apiFetch<{ data: { bookingNumber: string } }>(
        `/transport/route-patterns/${matSubject.id}/materialise`,
        { method: "POST", body: JSON.stringify(body) },
      );
      toast({ title: "تم إنشاء حجز", description: resp.data.bookingNumber });
      setMatSingleOpen(false);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر التوليد", description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const fireRange = async () => {
    if (!matSubject) return;
    const from = strOrNull(matRangeFrom);
    if (!from) {
      toast({ variant: "destructive", title: "تاريخ البداية مطلوب" });
      return;
    }
    const to = strOrNull(matRangeTo);
    const count = numOrNull(matRangeCount);
    if (to == null && count == null) {
      toast({ variant: "destructive", title: "أدخل تاريخ النهاية أو عدد المرات" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { fromDate: from };
      if (to) body.toDate = to;
      if (count != null) body.count = count;
      const resp = await apiFetch<{
        data: {
          created: Array<{ date: string; bookingNumber: string }>;
          skipped: Array<{ date: string; reason: string }>;
        };
      }>(
        `/transport/route-patterns/${matSubject.id}/materialise-range`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setMatResult(resp.data);
      toast({
        title: "تم تنفيذ التوليد",
        description: `${resp.data.created.length} حجز جديد، ${resp.data.skipped.length} موجود مسبقًا.`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر التوليد", description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  /* ── table columns ───────────────────────────────────────────── */

  const columns: DataTableColumn<RoutePatternRow>[] = [
    {
      key: "patternCode",
      header: "الرمز",
      sortable: true,
      searchable: true,
      render: (r) => <span className="font-mono text-sm">{r.patternCode}</span>,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      searchable: true,
      render: (r) => <span className="text-sm">{r.name}</span>,
    },
    {
      key: "daysOfWeekMask",
      header: "الأيام",
      render: (r) => <Badge variant="outline" className="text-[10px]">{dayMaskLabel(r.daysOfWeekMask)}</Badge>,
    },
    {
      key: "departureTime",
      header: "الانطلاق",
      render: (r) => <span className="text-xs">{r.departureTime || "—"}</span>,
    },
    {
      key: "route",
      header: "المسار",
      render: (r) => (
        <span className="text-xs">
          {r.fromLocationText || "—"} <span className="text-muted-foreground">→</span> {r.toLocationText || "—"}
        </span>
      ),
    },
    {
      key: "window",
      header: "النافذة",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {(r.activeFrom || "…")} → {(r.activeUntil || "…")}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <PageStatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm" variant="outline"
            disabled={!canCreate || r.status !== "active"}
            title={r.status !== "active" ? "القالب غير نشط" : "توليد يوم"}
            onClick={() => openMatSingle(r)}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={!canCreate || r.status !== "active"}
            title={r.status !== "active" ? "القالب غير نشط" : "توليد مدى"}
            onClick={() => openMatRange(r)}
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={!canUpdate}
            onClick={() => openEdit(r)}
            title="تعديل"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={!canDelete || r.status === "archived"}
            onClick={() => archive(r)}
            title={r.status === "archived" ? "مؤرشف بالفعل" : "أرشفة"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  /* ── render ──────────────────────────────────────────────────── */

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const toggleDay = (bit: number) =>
    setForm((s) => ({
      ...s,
      daysOfWeekMask: s.daysOfWeekMask ^ (1 << bit),
    }));

  return (
    <PageShell
      title="قوالب المسارات المتكررة"
      subtitle="قوالب الحجوزات الدورية للشحن — تُوَلِّد حجوزات نقل تلقائيًا بمصدر «جدول دوري»"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { label: "قوالب المسارات" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_transport_route_patterns"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قوالب المسارات المتكررة", total: printRows.length },
              items: printRows.map((r: any) => ({
                "الرمز": r.patternCode,
                "الاسم": r.name,
                "الأيام": dayMaskLabel(r.daysOfWeekMask),
                "الانطلاق": r.departureTime || "—",
                "المسار": `${r.fromLocationText || "—"} → ${r.toLocationText || "—"}`,
                "الحالة": STATUS_OPTIONS.find((o) => o.value === r.status)?.label ?? r.status,
              })),
            })}
          />
          <RefreshAction onRefresh={() => refetch()} />
          <GuardedButton perm="fleet.bookings:create" size="sm" variant="outline" onClick={openHeavyPreset}>
            <Truck className="h-4 w-4 me-1" />قالب نقل ثقيل
          </GuardedButton>
          <GuardedButton perm="fleet.bookings:create" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 me-1" />قالب جديد
          </GuardedButton>
        </div>
      }
    >
      <FleetTabsNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <KpiTile label="إجمالي القوالب" value={kpi.total} icon={RouteIcon} tone="info" />
        <KpiTile label="نشطة" value={kpi.active} icon={Play} tone="success" />
        <KpiTile label="متوقفة" value={kpi.paused} icon={CalendarRange} tone="warning" />
        <KpiTile label="مؤرشفة" value={kpi.archived} icon={Trash2} tone="muted" />
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Label className="text-xs">الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground ms-auto">
              التوليد يستخدم endpoint مادي قائم — لا route جديد ولا migration في هذا الـPR.
            </p>
          </div>
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            searchPlaceholder="ابحث بالرمز أو الاسم…"
            emptyMessage="لا توجد قوالب — أنشئ قالبًا جديدًا لتفعيل التوليد."
          />
        </CardContent>
      </Card>

      {/* ── Create / Edit dialog ─────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل القالب" : "قالب مسار جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الرمز (patternCode)</Label>
              <Input
                value={form.patternCode}
                onChange={(e) => setForm((s) => ({ ...s, patternCode: e.target.value }))}
                disabled={editing}
                maxLength={32}
                placeholder="RIY-JED-MO"
              />
              {editing && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  الرمز ثابت بعد الإنشاء (مفتاح فريد لكل شركة).
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">الاسم</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                maxLength={255}
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-xs">أيام التشغيل</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((d) => {
                  const on = (form.daysOfWeekMask & (1 << d.bit)) !== 0;
                  return (
                    <label
                      key={d.bit}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded border px-2 py-1 cursor-pointer text-xs",
                        on
                          ? "bg-status-info-surface border-status-info-surface text-status-info-foreground"
                          : "bg-surface-subtle border-border",
                      )}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => toggleDay(d.bit)}
                      />
                      <span>{d.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                القناع 7-بت بترتيب Riyadh المحلي (bit0 = أحد … bit6 = سبت).
              </p>
            </div>

            <div>
              <Label className="text-xs">وقت الانطلاق (HH:MM)</Label>
              <Input
                type="time"
                value={form.departureTime}
                onChange={(e) => setForm((s) => ({ ...s, departureTime: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">الحالة</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((s) => ({ ...s, status: v as PatternFormState["status"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_EDIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">نشِط من</Label>
              <Input
                type="date"
                value={form.activeFrom}
                onChange={(e) => setForm((s) => ({ ...s, activeFrom: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">نشِط حتى</Label>
              <Input
                type="date"
                value={form.activeUntil}
                onChange={(e) => setForm((s) => ({ ...s, activeUntil: e.target.value }))}
              />
            </div>

            <div>
              <Label className="text-xs">من (نص)</Label>
              <Input
                value={form.fromLocationText}
                onChange={(e) => setForm((s) => ({ ...s, fromLocationText: e.target.value }))}
                maxLength={255}
              />
            </div>
            <div>
              <Label className="text-xs">إلى (نص)</Label>
              <Input
                value={form.toLocationText}
                onChange={(e) => setForm((s) => ({ ...s, toLocationText: e.target.value }))}
                maxLength={255}
              />
            </div>

            <ClassSelectField
              label="صنف المركبة الافتراضي"
              value={form.defaultVehicleClass}
              options={VEHICLE_CLASS_OPTIONS}
              onChange={(v) => setForm((s) => ({ ...s, defaultVehicleClass: v }))}
            />
            <ClassSelectField
              label="صنف الرخصة الافتراضي"
              value={form.defaultLicenseClass}
              options={LICENSE_CLASS_OPTIONS}
              onChange={(v) => setForm((s) => ({ ...s, defaultLicenseClass: v }))}
            />

            <div>
              <Label className="text-xs">الوزن الافتراضي</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.defaultCargoWeight}
                onChange={(e) => setForm((s) => ({ ...s, defaultCargoWeight: e.target.value }))}
                placeholder="—"
              />
            </div>
            <div>
              <Label className="text-xs">وحدة الوزن</Label>
              <Input
                value={form.defaultCargoUnit}
                onChange={(e) => setForm((s) => ({ ...s, defaultCargoUnit: e.target.value }))}
                placeholder="kg / ton"
                maxLength={32}
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">نقاط التشغيل (تحميل/ميزان/فحص/تفريغ…)</Label>
                <Button
                  type="button" size="sm" variant="outline" className="h-7"
                  onClick={() => setForm((s) => ({
                    ...s, operationalWaypoints: [...s.operationalWaypoints, { kind: "loading", notes: "" }],
                  }))}
                >
                  <Plus className="h-3.5 w-3.5 me-1" />إضافة نقطة
                </Button>
              </div>
              {form.operationalWaypoints.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  لا نقاط. تُنقل هذه النقاط لكل حجز يُولَّد من القالب وتظهر في تنفيذ الرحلة.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.operationalWaypoints.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={w.kind}
                        onValueChange={(v) => setForm((s) => ({
                          ...s,
                          operationalWaypoints: s.operationalWaypoints.map((x, j) => (j === i ? { ...x, kind: v } : x)),
                        }))}
                      >
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WAYPOINT_KIND_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 flex-1" placeholder="ملاحظة (اختياري)" maxLength={255}
                        value={w.notes ?? ""}
                        onChange={(e) => setForm((s) => ({
                          ...s,
                          operationalWaypoints: s.operationalWaypoints.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)),
                        }))}
                      />
                      <Button
                        type="button" size="sm" variant="outline" className="h-8"
                        onClick={() => setForm((s) => ({
                          ...s, operationalWaypoints: s.operationalWaypoints.filter((_, j) => j !== i),
                        }))}
                        title="حذف النقطة"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                rows={2}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>إلغاء</Button>
            <Button onClick={save} disabled={busy}>{busy ? "جاري الحفظ…" : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Materialise single-day dialog ────────────────────── */}
      <Dialog open={matSingleOpen} onOpenChange={setMatSingleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              توليد حجز ليوم محدد — {matSubject?.patternCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              ينشئ صف واحد في <code className="font-mono text-[10px]">transport_bookings</code> مصدره
              <code className="font-mono text-[10px]"> recurring_schedule</code>. اتركه فارغًا لتوليد لليوم.
            </p>
            <div>
              <Label className="text-xs">التاريخ المستهدف</Label>
              <Input
                type="date"
                value={matSingleDate}
                onChange={(e) => setMatSingleDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatSingleOpen(false)} disabled={busy}>إلغاء</Button>
            <Button onClick={fireSingle} disabled={busy}>{busy ? "…" : "تنفيذ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Materialise range dialog ─────────────────────────── */}
      <Dialog open={matRangeOpen} onOpenChange={setMatRangeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              توليد مدى — {matSubject?.patternCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              يولّد حجوزات لكل تاريخ في النطاق يطابق قناع الأيام + نافذة النشاط.
              العملية idempotent — التواريخ الموجودة مسبقًا تُتجاهَل وتُعاد في
              <code className="font-mono"> skipped</code>. السقف 90 يومًا تقويمية لكل طلب.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">من</Label>
                <Input
                  type="date"
                  value={matRangeFrom}
                  onChange={(e) => setMatRangeFrom(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input
                  type="date"
                  value={matRangeTo}
                  onChange={(e) => setMatRangeTo(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">أو عدد المطابقات (1..90)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={matRangeCount}
                  onChange={(e) => setMatRangeCount(e.target.value)}
                  placeholder="استخدم إذا تركت تاريخ النهاية فارغًا"
                />
              </div>
            </div>
            {matResult && (
              <div className="border rounded p-2 bg-surface-subtle text-xs space-y-2 max-h-56 overflow-auto">
                <div>
                  <span className="font-semibold text-status-success-foreground">{matResult.created.length}</span>
                  {" حجز جديد، "}
                  <span className="font-semibold text-status-warning-foreground">{matResult.skipped.length}</span>
                  {" موجود مسبقًا."}
                </div>
                {matResult.created.slice(0, 50).map((c) => (
                  <div key={c.bookingNumber} className="flex justify-between font-mono">
                    <span>{c.date}</span><span>{c.bookingNumber}</span>
                  </div>
                ))}
                {matResult.skipped.length > 0 && (
                  <div className="border-t pt-1 text-muted-foreground">
                    {matResult.skipped.slice(0, 10).map((s) => (
                      <div key={s.date} className="flex justify-between font-mono">
                        <span>{s.date}</span><span className="italic">{s.reason}</span>
                      </div>
                    ))}
                    {matResult.skipped.length > 10 && (
                      <div className="text-[10px]">… (+{matResult.skipped.length - 10})</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatRangeOpen(false)} disabled={busy}>إغلاق</Button>
            <Button onClick={fireRange} disabled={busy}>{busy ? "…" : "تنفيذ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */

// قائمة صنف (مركبة/رخصة) تعرض عربيًا وتخزّن الكود القانوني. «— غير محدّد» ↔ "".
// تحفظ قيمة قديمة غير قانونية بإضافتها كخيار حتى لا يضيع تعديل قالب سابق.
function ClassSelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const known = value === "" || options.some((o) => o.value === value);
  const merged = known ? options : [{ value, label: value }, ...options];
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select
        value={value === "" ? "_none" : value}
        onValueChange={(v) => onChange(v === "_none" ? "" : v)}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">— غير محدّد</SelectItem>
          {merged.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function KpiTile({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "info" | "success" | "warning" | "muted";
}) {
  const toneClass = tone === "success"
    ? "text-status-success-foreground bg-status-success-surface"
    : tone === "warning"
      ? "text-status-warning-foreground bg-status-warning-surface"
      : tone === "info"
        ? "text-status-info-foreground bg-status-info-surface"
        : "text-muted-foreground bg-surface-subtle";
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn("rounded p-2", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
