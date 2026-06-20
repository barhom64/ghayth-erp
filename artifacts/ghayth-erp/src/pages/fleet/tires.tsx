// N4 — Fleet tires inventory page.
//
// Closes N4 from docs/testing/CRITICAL_DEFECTS_REPORT.md. Lists all
// active tires across the fleet with per-vehicle grouping, brand,
// size, position, install-mileage, install-date. The "Add tire" CTA
// links to a create form (kept simple — just a modal here so the
// fleet manager doesn't bounce to another page for a 30-second op).
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Disc, Plus, Pencil, Trash2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { VehicleSelect } from "@/components/shared/entity-selects";
import { useToast } from "@/hooks/use-toast";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

const POSITION_LABEL: Record<string, string> = {
  front_left: "أمامي يسار",
  front_right: "أمامي يمين",
  rear_left: "خلفي يسار",
  rear_right: "خلفي يمين",
  spare: "احتياطي",
  extra: "إضافي",
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  rotated: "تم تدويره",
  replaced: "تم استبداله",
  discarded: "خارج الخدمة",
};

export default function TiresPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: tiresResp, isLoading, isError, refetch } = useApiQuery<any>(
    ["fleet-tires"], "/fleet/tires"
  );
  const tires = asList(tiresResp);
  const [filters, setFilters] = useFilters();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTire, setEditingTire] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; notes: string }>({ status: "", notes: "" });
  const [form, setForm] = useState({
    vehicleId: "",
    position: "front_left",
    brand: "",
    size: "",
    installMileage: "",
    installDate: "",
    notes: "",
  });

  const createMut = useApiMutation("/fleet/tires", "POST");

  const saveTireEdit = async () => {
    if (!editingTire) return;
    try {
      await (await import("@/lib/api")).apiFetch(`/fleet/tires/${editingTire.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: editForm.status, notes: editForm.notes || undefined }),
      });
      toast({ title: "تم تحديث الإطار" });
      setEditingTire(null);
      await refetch();
    } catch (err: any) {
      toast({ title: "فشل التحديث", description: err?.message ?? "خطأ", variant: "destructive" });
    }
  };

  const deleteTire = async (id: number) => {
    if (!confirm("حذف هذا الإطار؟")) return;
    try {
      await (await import("@/lib/api")).apiFetch(`/fleet/tires/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      await refetch();
    } catch (err: any) {
      toast({ title: "فشل الحذف", description: err?.message ?? "خطأ", variant: "destructive" });
    }
  };

  const filtered = applyFilters(tires, filters, { searchFields: ["plateNumber", "brand", "size"] });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      sortable: true,
      className: "font-mono",
      render: (t) => t.plateNumber || `#${t.vehicleId}`,
    },
    {
      key: "position",
      header: "الموقع",
      sortable: true,
      render: (t) => POSITION_LABEL[t.position] || t.position,
    },
    { key: "brand", header: "البراند", sortable: true, render: (t) => t.brand || "—" },
    { key: "size", header: "المقاس", sortable: true, className: "font-mono", render: (t) => t.size || "—" },
    {
      key: "installMileage",
      header: "عند التركيب (كم)",
      sortable: true,
      className: "text-end",
      render: (t) => t.installMileage ? Number(t.installMileage).toLocaleString("ar-SA") : "—",
    },
    { key: "installDate", header: "تاريخ التركيب", sortable: true, render: (t) => formatDateAr(t.installDate) },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (t) => STATUS_LABEL[t.status] || t.status,
    },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <div className="flex gap-1">
          <GuardedButton
            perm="fleet.maintenance:create"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => { setEditingTire(t); setEditForm({ status: t.status, notes: t.notes || "" }); }}
          >
            <Pencil className="h-3 w-3" />
          </GuardedButton>
          <GuardedButton
            perm="fleet.maintenance:create"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => deleteTire(t.id)}
          >
            <Trash2 className="h-3 w-3" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="إطارات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "الإطارات" }]}
      loading={isLoading}
      actions={
        <>
          <GuardedButton perm="fleet.maintenance:create" onClick={() => setShowCreate((v) => !v)} data-testid="button-add-tire">
            <Plus className="h-4 w-4 me-1" />
            {showCreate ? "إلغاء" : "إضافة إطار"}
          </GuardedButton>
          <PrintButton
            entityType="report_fleet_tires"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "إطارات الأسطول", total: printRows.length },
              items: printRows.map((t: any) => ({
                "المركبة": t.plateNumber || `#${t.vehicleId}`,
                "الموقع": POSITION_LABEL[t.position] || t.position || "—",
                "البراند": t.brand || "—",
                "المقاس": t.size || "—",
                "عند التركيب (كم)": t.installMileage ?? "—",
                "تاريخ التركيب": t.installDate || "—",
                "الحالة": STATUS_LABEL[t.status] || t.status || "—",
              })),
            })}
          />
        </>
      }
    >
      <FleetTabsNav />

      {showCreate && (
        <div className="rounded-lg border bg-white p-4 mb-4 space-y-3" data-testid="form-create-tire">
          <h3 className="text-lg font-semibold">تسجيل إطار جديد</h3>
          <div className="grid grid-cols-2 gap-3">
            <VehicleSelect
              label="المركبة"
              required
              placeholder="— اختر مركبة —"
              value={form.vehicleId}
              onChange={(v) => setForm((x) => ({ ...x, vehicleId: v }))}
            />
            <div>
              <Label>الموقع *</Label>
              <select
                className="w-full h-10 border rounded-md px-2"
                data-testid="select-position"
                value={form.position}
                onChange={(e) => setForm((v) => ({ ...v, position: e.target.value }))}
              >
                {Object.entries(POSITION_LABEL).map(([k, lbl]) => (
                  <option key={k} value={k}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>البراند</Label>
              <Input data-testid="input-brand" value={form.brand} onChange={(e) => setForm((v) => ({ ...v, brand: e.target.value }))} />
            </div>
            <div>
              <Label>المقاس (مثال 215/65 R16)</Label>
              <Input data-testid="input-size" value={form.size} onChange={(e) => setForm((v) => ({ ...v, size: e.target.value }))} />
            </div>
            <div>
              <Label>عداد المركبة عند التركيب (كم)</Label>
              <Input
                type="number"
                data-testid="input-install-mileage"
                value={form.installMileage}
                onChange={(e) => setForm((v) => ({ ...v, installMileage: e.target.value }))}
              />
            </div>
            <div>
              <Label>تاريخ التركيب</Label>
              <Input
                type="date"
                data-testid="input-install-date"
                value={form.installDate}
                onChange={(e) => setForm((v) => ({ ...v, installDate: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <Label>ملاحظات</Label>
              <Input data-testid="input-notes" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              data-testid="button-submit-tire"
              disabled={!form.vehicleId || createMut.isPending}
              onClick={async () => {
                try {
                  await createMut.mutateAsync({
                    vehicleId: Number(form.vehicleId),
                    position: form.position,
                    brand: form.brand || undefined,
                    size: form.size || undefined,
                    installMileage: form.installMileage ? Number(form.installMileage) : undefined,
                    installDate: form.installDate || undefined,
                    notes: form.notes || undefined,
                  });
                  toast({ title: "تم تسجيل الإطار" });
                  setForm({ vehicleId: "", position: "front_left", brand: "", size: "", installMileage: "", installDate: "", notes: "" });
                  setShowCreate(false);
                  await refetch();
                } catch (err: any) {
                  toast({ title: "فشل التسجيل", description: err?.message ?? "خطأ", variant: "destructive" });
                }
              }}
            >
              {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <AdvancedFilters
        config={{ searchPlaceholder: "ابحث بـ رقم اللوحة، البراند، المقاس..." }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "plateNumber", label: "المركبة" },
              { key: "position", label: "الموقع" },
              { key: "brand", label: "البراند" },
              { key: "size", label: "المقاس" },
              { key: "installMileage", label: "عند التركيب (كم)" },
              { key: "installDate", label: "تاريخ التركيب" },
              { key: "status", label: "الحالة" },
            ],
            "إطارات-الأسطول",
          )
        }
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        rowKey={(t: any) => t.id}
        isLoading={isLoading}
        isError={isError}
        emptyMessage="لا توجد إطارات مسجلة. ابدأ بتسجيل أول إطار من زر 'إضافة إطار'."
        emptyIcon={<Disc className="h-6 w-6 text-slate-400" />}
      />
      {editingTire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingTire(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base">تعديل الإطار #{editingTire.id}</h3>
            <div>
              <Label>الحالة</Label>
              <select className="w-full h-10 border rounded-md px-2 mt-1" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                {Object.entries(STATUS_LABEL).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input className="mt-1" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingTire(null)}>إلغاء</Button>
              <Button size="sm" onClick={saveTireEdit}>حفظ</Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
