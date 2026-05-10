import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PageStatusBadge } from "@/components/page-status-badge";
import { Car, Wrench, Fuel, Shield, Gauge, MapPin, Pencil, Trash2, X, Check, BookOpen, AlertTriangle, XCircle, Info, Banknote, FileText } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import { EntityObligations } from "@/components/shared/entity-obligations";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { LinkedTasks } from "@/components/shared/linked-tasks";
import { CheckSquare } from "lucide-react";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

const TABS = [
  { key: "overview", label: "نظرة شاملة", icon: Car },
  { key: "info", label: "المعلومات", icon: Car },
  { key: "trips", label: "الرحلات", icon: MapPin },
  { key: "maintenance", label: "الصيانة", icon: Wrench },
  { key: "fuel", label: "الوقود", icon: Fuel },
  { key: "insurance", label: "التأمين", icon: Shield },
  { key: "tasks", label: "المهام", icon: CheckSquare },
  { key: "finance", label: "المالية", icon: BookOpen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const VEHICLE_STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "in_use", label: "قيد الاستخدام" },
  { value: "maintenance", label: "في الصيانة" },
  { value: "out_of_service", label: "خارج الخدمة" },
];

const IMPACT_ICONS = {
  financial: Banknote,
  operational: Car,
  legal: FileText,
  notification: AlertTriangle,
};

const SEVERITY_COLORS = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  critical: "bg-red-50 border-red-200 text-red-800",
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
};

export default function VehicleDetail() {
  const [, params] = useRoute("/fleet/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const { data: vehicle, isLoading, isError, error, refetch } = useApiQuery<any>(["vehicle-detail", id || ""], `/fleet/vehicles/${id}`, !!id);
  const { data: tco } = useApiQuery<any>(["vehicle-tco", id || ""], `/fleet/vehicles/${id}/tco`, !!id);
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("vehicle", id || "");

  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const vehicleStatusTone = (s: string): "success" | "warning" | "info" | "muted" | "destructive" | "default" => {
    switch (s) {
      case "available": return "success";
      case "in_use": return "info";
      case "maintenance": return "warning";
      case "out_of_service": return "destructive";
      default: return "default";
    }
  };

  const trips: any[] = vehicle?.trips || [];
  const maintenance: any[] = vehicle?.maintenance || [];
  const fuelLogs: any[] = vehicle?.fuelLogs || [];
  const insuranceList: any[] = vehicle?.insurance || [];

  const totalFuelCost = fuelLogs.reduce((s: number, f: any) => s + (Number(f.totalCost) || 0), 0);
  const totalMaintenanceCost = maintenance.reduce((s: number, m: any) => s + (Number(m.cost) || 0), 0);

  const startEdit = () => {
    setEditForm({
      plateNumber: vehicle?.plateNumber || "",
      status: vehicle?.status || "available",
      color: vehicle?.color || "",
      notes: vehicle?.notes || "",
      registrationNumber: vehicle?.registrationNumber || "",
      registrationExpiry: vehicle?.registrationExpiry ? vehicle.registrationExpiry.split("T")[0] : "",
      inspectionDate: vehicle?.inspectionDate ? vehicle.inspectionDate.split("T")[0] : "",
      nextInspectionDate: vehicle?.nextInspectionDate ? vehicle.nextInspectionDate.split("T")[0] : "",
      plateType: vehicle?.plateType || "",
      sequenceNumber: vehicle?.sequenceNumber || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await apiFetch(`/fleet/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plateNumber: editForm.plateNumber,
          status: editForm.status,
          color: editForm.color,
          notes: editForm.notes,
          registrationNumber: editForm.registrationNumber,
          registrationExpiry: editForm.registrationExpiry,
          inspectionDate: editForm.inspectionDate,
          nextInspectionDate: editForm.nextInspectionDate,
          plateType: editForm.plateType,
          sequenceNumber: editForm.sequenceNumber,
        }),
      });
      toast({ title: "تم تحديث المركبة" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["vehicle-detail", id] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/fleet/vehicles/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المركبة" });
      navigate("/fleet");
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const statusLabel = VEHICLE_STATUS_OPTIONS.find(o => o.value === vehicle?.status)?.label || vehicle?.status || "";

  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={`/fleet/${id}/status`}>
        <Button variant="outline" size="sm" className="gap-1">
          <Pencil className="h-4 w-4" />تغيير الحالة
        </Button>
      </Link>
      <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 me-1" />تعديل</Button>
      {deleting ? (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
          <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
      )}
    </div>
  );

  const overview = !vehicle ? (
    <div className="text-sm text-muted-foreground p-4">جاري التحميل...</div>
  ) : (
    <div className="space-y-4">
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">تعديل المركبة</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium">رقم اللوحة</label>
                <Input value={editForm.plateNumber} onChange={e => setEditForm(f => ({...f, plateNumber: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({...f, status: v}))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">متاحة</SelectItem>
                    <SelectItem value="in_use">قيد الاستخدام</SelectItem>
                    <SelectItem value="maintenance">في الصيانة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">اللون</label>
                <Input value={editForm.color} onChange={e => setEditForm(f => ({...f, color: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">ملاحظات</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} className="mt-1" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-3">بيانات التسجيل الحكومية (تم)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">رقم الاستمارة</label>
                  <Input value={editForm.registrationNumber} onChange={e => setEditForm(f => ({...f, registrationNumber: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">انتهاء الاستمارة</label>
                  <UnifiedDateInput value={editForm.registrationExpiry} onChange={(iso) => setEditForm(f => ({...f, registrationExpiry: iso}))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">نوع اللوحة</label>
                  <Select value={editForm.plateType || "_none"} onValueChange={(v) => setEditForm(f => ({...f, plateType: v === "_none" ? "" : v}))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">اختر</SelectItem>
                      <SelectItem value="private">خاصة</SelectItem>
                      <SelectItem value="commercial">تجارية</SelectItem>
                      <SelectItem value="government">حكومية</SelectItem>
                      <SelectItem value="diplomatic">دبلوماسية</SelectItem>
                      <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">رقم التسلسل</label>
                  <Input value={editForm.sequenceNumber} onChange={e => setEditForm(f => ({...f, sequenceNumber: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">تاريخ آخر فحص</label>
                  <UnifiedDateInput value={editForm.inspectionDate} onChange={(iso) => setEditForm(f => ({...f, inspectionDate: iso}))} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">الفحص القادم</label>
                  <UnifiedDateInput value={editForm.nextInspectionDate} onChange={(iso) => setEditForm(f => ({...f, nextInspectionDate: iso}))} className="mt-1" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button onClick={saveEdit}><Check className="h-4 w-4 me-1" />حفظ</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 me-1" />إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50"><Gauge className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{Number(vehicle.currentMileage || 0).toLocaleString()}</p><p className="text-xs text-gray-500">كم</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-50"><Fuel className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xl font-bold">{formatCurrency(totalFuelCost)}</p><p className="text-xs text-gray-500">تكلفة الوقود</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-50"><Wrench className="w-5 h-5 text-orange-600" /></div>
          <div><p className="text-xl font-bold">{formatCurrency(totalMaintenanceCost)}</p><p className="text-xs text-gray-500">تكلفة الصيانة</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50"><MapPin className="w-5 h-5 text-purple-600" /></div>
          <div><p className="text-xl font-bold">{trips.length}</p><p className="text-xs text-gray-500">الرحلات</p></div>
        </CardContent></Card>
      </div>

      {(() => {
        const totalTripCost = trips.reduce((s: number, t: any) => s + (Number(t.cost) || 0), 0);
        const totalDistance = trips.reduce((s: number, t: any) => s + (Number(t.distance) || 0), 0);
        const totalLiters = fuelLogs.reduce((s: number, f: any) => s + (Number(f.liters) || 0), 0);
        const fuelEfficiency = totalDistance > 0 && totalLiters > 0 ? (totalDistance / totalLiters).toFixed(1) : "—";
        const totalOperatingCost = totalFuelCost + totalMaintenanceCost + totalTripCost;
        return (
          <Card className="border-0 shadow-sm bg-gradient-to-l from-blue-50/30 to-white">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-600" />
                ملخص التشغيل
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-blue-600">{totalDistance.toLocaleString()} كم</p>
                  <p className="text-[10px] text-gray-500">إجمالي المسافة</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-green-600">{totalLiters.toFixed(0)} لتر</p>
                  <p className="text-[10px] text-gray-500">إجمالي الوقود</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-teal-600">{fuelEfficiency} كم/لتر</p>
                  <p className="text-[10px] text-gray-500">كفاءة الوقود</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(totalOperatingCost)}</p>
                  <p className="text-[10px] text-gray-500">تكلفة التشغيل الكلية</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-purple-600">{maintenance.filter((m: any) => m.status !== "completed").length}</p>
                  <p className="text-[10px] text-gray-500">صيانة قيد التنفيذ</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex gap-2 border-b overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const count = tab.key === "trips" ? trips.length
            : tab.key === "maintenance" ? maintenance.length
            : tab.key === "fuel" ? fuelLogs.length
            : tab.key === "insurance" ? insuranceList.length : 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && tab.key !== "info" && tab.key !== "overview" && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-blue-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-blue-600 mb-1">المسافة المقطوعة</p>
                <p className="text-xl font-bold text-blue-700">{Number(vehicle.currentMileage || 0).toLocaleString()} كم</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-green-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-green-600 mb-1">تكلفة الوقود</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totalFuelCost)}</p>
                <p className="text-[10px] text-green-500">{fuelLogs.length} تعبئة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-orange-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-orange-600 mb-1">تكلفة الصيانة</p>
                <p className="text-xl font-bold text-orange-700">{formatCurrency(totalMaintenanceCost)}</p>
                <p className="text-[10px] text-orange-500">{maintenance.length} عملية</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-purple-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-purple-600 mb-1">إجمالي التكلفة</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(totalFuelCost + totalMaintenanceCost)}</p>
                <p className="text-[10px] text-purple-500">{trips.length} رحلة</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-500" /> معلومات أساسية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">الصانع / الموديل</p>
                    <p className="font-medium">{vehicle.make} {vehicle.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">السنة</p>
                    <p className="font-medium">{vehicle.year || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">رقم اللوحة</p>
                    <p className="font-medium font-mono">{vehicle.plateNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">اللون</p>
                    <p className="font-medium">{vehicle.color || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">السائق</p>
                    <p className="font-medium">{vehicle.driverName || "غير معين"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">نوع الوقود</p>
                    <p className="font-medium">{fuelTypeLabel(vehicle.fuelType)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {insuranceList.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" /> التأمين الحالي
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">الشركة</p>
                      <p className="font-medium">{insuranceList[0].provider || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">رقم البوليصة</p>
                      <p className="font-medium font-mono">{insuranceList[0].policyNumber || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">بداية التأمين</p>
                      <p className="font-medium">{formatDateAr(insuranceList[0].startDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">نهاية التأمين</p>
                      <p className="font-medium">{formatDateAr(insuranceList[0].endDate)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {maintenance.filter((m: any) => m.status === "pending" || m.status === "in_progress").length > 0 && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="w-4 h-4" /> صيانة قيد التنفيذ
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "type", header: "النوع", render: (m) => m.type || m.description || "-" },
                    { key: "scheduledDate", header: "التاريخ", render: (m) => formatDateAr(m.scheduledDate || m.createdAt) },
                    { key: "cost", header: "التكلفة", render: (m) => <span className="font-bold">{formatCurrency(Number(m.cost || 0))}</span> },
                    { key: "status", header: "الحالة", render: (m) => <PageStatusBadge status={m.status} /> },
                  ]}
                  data={maintenance.filter((m: any) => m.status === "pending" || m.status === "in_progress").slice(0, 5)}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              </CardContent>
            </Card>
          )}

          {fuelLogs.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-green-500" /> سجل استهلاك الوقود
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const monthlyFuel: Record<string, { liters: number; cost: number; count: number }> = {};
                  fuelLogs.forEach((f: any) => {
                    const month = f.date ? f.date.slice(0, 7) : "unknown";
                    if (!monthlyFuel[month]) monthlyFuel[month] = { liters: 0, cost: 0, count: 0 };
                    monthlyFuel[month].liters += Number(f.liters || 0);
                    monthlyFuel[month].cost += Number(f.cost || 0);
                    monthlyFuel[month].count += 1;
                  });
                  const months = Object.entries(monthlyFuel).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
                  const maxCost = Math.max(...months.map(([, v]) => v.cost), 1);
                  return (
                    <div className="space-y-2">
                      {months.map(([month, data]) => (
                        <div key={month} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-16 text-left font-mono">{month}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                            <div
                              className="bg-green-400 h-full rounded-full transition-all"
                              style={{ width: `${(data.cost / maxCost) * 100}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                              {formatCurrency(data.cost)} ({data.liters.toFixed(0)} لتر)
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 w-10">{data.count} مرة</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {maintenance.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-orange-500" /> سجل الصيانة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {maintenance.slice(0, 8).map((m: any, idx: number) => (
                    <div key={m.id || idx} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 text-sm">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", m.status === "completed" ? "bg-green-500" : m.status === "in_progress" ? "bg-orange-500" : "bg-gray-400")} />
                        <div>
                          <p className="text-xs font-medium">{m.type || m.description || "صيانة"}</p>
                          <p className="text-[10px] text-gray-500">{formatDateAr(m.scheduledDate || m.createdAt)}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <p className="font-bold text-xs">{formatCurrency(Number(m.cost || 0))}</p>
                        <PageStatusBadge status={m.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Car className="w-5 h-5" /> المعلومات الأساسية</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">رقم اللوحة</span><span className="col-span-2 font-mono">{vehicle.plateNumber}</span></div>
              {vehicle.vinNumber && <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">الشاصي</span><span className="col-span-2 font-mono text-xs" dir="ltr">{vehicle.vinNumber}</span></div>}
              <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">اللون</span><span className="col-span-2">{vehicle.color || "-"}</span></div>
              <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">نوع الوقود</span><span className="col-span-2">{fuelTypeLabel(vehicle.fuelType)}</span></div>
              <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">السائق</span><span className="col-span-2">{vehicle.driverName || "-"}</span></div>
              {vehicle.driverPhone && <div className="grid grid-cols-3 py-2"><span className="text-gray-500">هاتف السائق</span><span className="col-span-2" dir="ltr">{vehicle.driverPhone}</span></div>}
            </CardContent>
          </Card>

          {insuranceList.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5" /> التأمين الحالي</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">الشركة</span><span className="col-span-2">{insuranceList[0].provider || "-"}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">رقم البوليصة</span><span className="col-span-2 font-mono">{insuranceList[0].policyNumber || "-"}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">النوع</span><span className="col-span-2">{insuranceTypeLabel(insuranceList[0].type)}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-gray-500">الفترة</span><span className="col-span-2">{insuranceList[0].startDate ? formatDateAr(insuranceList[0].startDate) : "-"} - {insuranceList[0].endDate ? formatDateAr(insuranceList[0].endDate) : "-"}</span></div>
                <div className="grid grid-cols-3 py-2"><span className="text-gray-500">القسط</span><span className="col-span-2">{formatCurrency(Number(insuranceList[0].premium || 0))}</span></div>
              </CardContent>
            </Card>
          )}
          {insuranceList.length === 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5" /> التأمين</CardTitle></CardHeader>
              <CardContent><p className="text-center text-gray-400 py-4">لا توجد بيانات تأمين</p></CardContent>
            </Card>
          )}

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                بيانات التسجيل والفحص — الربط الحكومي (تم)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الاستمارة</p><p className="font-mono">{vehicle.registrationNumber || "-"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء الاستمارة</p><p>{vehicle.registrationExpiry ? formatDateAr(vehicle.registrationExpiry) : "-"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">نوع اللوحة</p><p>{vehicle.plateType === "private" ? "خاصة" : vehicle.plateType === "commercial" ? "تجارية" : vehicle.plateType === "government" ? "حكومية" : vehicle.plateType === "diplomatic" ? "دبلوماسية" : vehicle.plateType === "motorcycle" ? "دراجة نارية" : vehicle.plateType || "-"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم التسلسل</p><p className="font-mono">{vehicle.sequenceNumber || "-"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">تاريخ آخر فحص دوري</p><p>{vehicle.inspectionDate ? formatDateAr(vehicle.inspectionDate) : "-"}</p></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">الفحص الدوري القادم</p><p>{vehicle.nextInspectionDate ? formatDateAr(vehicle.nextInspectionDate) : "-"}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "trips" && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="w-5 h-5" /> الرحلات ({trips.length})</CardTitle></CardHeader>
          <CardContent>
            {trips.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد رحلات</p>
            ) : (
              <DataTable
                columns={[
                  { key: "fromLocation", header: "من", render: (t) => t.fromLocation || "-" },
                  { key: "toLocation", header: "إلى", render: (t) => t.toLocation || "-" },
                  { key: "distance", header: "المسافة", ltr: true, render: (t) => <span className="font-mono">{Number(t.distance || 0).toFixed(1)} km</span> },
                  { key: "cost", header: "التكلفة", render: (t) => formatCurrency(Number(t.cost || 0)) },
                  { key: "driverName", header: "السائق", render: (t) => <span className="text-gray-500">{t.driverName || "-"}</span> },
                  { key: "status", header: "الحالة", render: (t) => <PageStatusBadge status={t.status} /> },
                ]}
                data={trips}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "maintenance" && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="w-5 h-5" /> سجل الصيانة ({maintenance.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {maintenance.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد سجلات صيانة</p>
            ) : (
              <DataTable
                columns={[
                  { key: "type", header: "النوع", render: (m) => <span className="font-medium">{maintenanceTypeLabel(m.type)}</span> },
                  { key: "description", header: "الوصف", render: (m) => <span className="text-gray-500">{m.description || "-"}</span> },
                  { key: "serviceDate", header: "التاريخ", render: (m) => <span className="text-gray-500">{m.serviceDate ? formatDateAr(m.serviceDate) : "-"}</span> },
                  { key: "cost", header: "التكلفة", render: (m) => Number(m.cost) > 0 ? formatCurrency(Number(m.cost)) : "-" },
                  { key: "mileageAtService", header: "العداد", ltr: true, render: (m) => <span className="font-mono">{m.mileageAtService ? `${Number(m.mileageAtService).toLocaleString()} km` : "-"}</span> },
                  { key: "status", header: "الحالة", render: (m) => <PageStatusBadge status={m.status} /> },
                ]}
                data={maintenance}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "fuel" && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Fuel className="w-5 h-5" /> سجل الوقود ({fuelLogs.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {fuelLogs.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد سجلات وقود</p>
            ) : (
              <DataTable
                columns={[
                  { key: "fuelDate", header: "التاريخ", render: (f) => <span className="text-gray-500">{f.fuelDate ? formatDateAr(f.fuelDate) : "-"}</span> },
                  { key: "liters", header: "الكمية", render: (f) => `${Number(f.liters || 0).toFixed(1)} لتر` },
                  { key: "totalCost", header: "التكلفة", render: (f) => formatCurrency(Number(f.totalCost || 0)) },
                  { key: "mileageAtFuel", header: "العداد", ltr: true, render: (f) => <span className="font-mono">{f.mileageAtFuel ? `${Number(f.mileageAtFuel).toLocaleString()} km` : "-"}</span> },
                  { key: "stationName", header: "المحطة", render: (f) => <span className="text-gray-500">{f.stationName || "-"}</span> },
                ]}
                data={fuelLogs}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "insurance" && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5" /> سجل التأمين ({insuranceList.length})</CardTitle></CardHeader>
          <CardContent>
            {insuranceList.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد سجل تأمين</p>
            ) : (
              <div className="space-y-3">
                {insuranceList.map((ins: any) => (
                  <div key={ins.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{ins.provider || "-"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ins.policyNumber || "-"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ins.startDate ? formatDateAr(ins.startDate) : "-"} — {ins.endDate ? formatDateAr(ins.endDate) : "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{insuranceTypeLabel(ins.type)}</Badge>
                      <span className="font-bold text-sm">{formatCurrency(Number(ins.premium || 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "tasks" && id && (
        <LinkedTasks entityType="vehicle" entityId={id} />
      )}

      {activeTab === "finance" && id && (
        <div className="space-y-6">
          {tco && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-orange-600" />
                  تحليل التكلفة الكلية (TCO)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(Number(tco.totalCost || 0))}</p>
                    <p className="text-[10px] text-blue-600">التكلفة الإجمالية</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-lg font-bold text-orange-700">{formatCurrency(Number(tco.costPerKm || 0))}</p>
                    <p className="text-[10px] text-orange-600">تكلفة/كم</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg border">
                    <p className="text-lg font-bold">{Number(tco.totalKm || 0).toLocaleString("ar-SA")}</p>
                    <p className="text-[10px] text-gray-500">إجمالي الكيلومترات</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-lg font-bold text-purple-700">{Number(tco.totalTrips || 0)}</p>
                    <p className="text-[10px] text-purple-600">إجمالي الرحلات</p>
                  </div>
                </div>
                {tco.breakdown && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">تفصيل التكاليف</p>
                    {[
                      { label: "سعر الشراء", value: tco.breakdown.purchase, color: "bg-blue-500" },
                      { label: "الاستهلاك", value: tco.breakdown.depreciation, color: "bg-gray-500" },
                      { label: "الوقود", value: tco.breakdown.fuel, color: "bg-amber-500" },
                      { label: "الصيانة", value: tco.breakdown.maintenance, color: "bg-orange-500" },
                      { label: "التأمين", value: tco.breakdown.insurance, color: "bg-emerald-500" },
                      { label: "المخالفات", value: tco.breakdown.fines, color: "bg-red-500" },
                    ].filter(item => Number(item.value) > 0).map(item => {
                      const pct = tco.totalCost > 0 ? Math.round((Number(item.value) / tco.totalCost) * 100) : 0;
                      return (
                        <div key={item.label} className="flex items-center gap-3 text-sm">
                          <span className="w-20 text-xs text-gray-500">{item.label}</span>
                          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", item.color)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-24 text-xs font-bold text-left">{formatCurrency(Number(item.value))}</span>
                          <span className="w-10 text-[10px] text-gray-400 text-left">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-600" /> الملف المالي الشامل</CardTitle></CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="vehicle" entityId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">دفتر الأستاذ المساعد</CardTitle></CardHeader>
            <CardContent>
              <FinancialTab entityType="vehicle" entityId={id} />
            </CardContent>
          </Card>
        </div>
      )}

      {id && (
        <EntityObligations entityType="fleet-vehicle,fleet-maintenance,fleet-insurance" entityId={id} hideWhenEmpty />
      )}

      {id && <EntityComments entityType="vehicle" entityId={id} />}
      {id && <EntityTags entityType="vehicle" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={`${vehicle?.make || ""} ${vehicle?.model || ""} ${vehicle?.year || ""}`.trim() || "المركبة"}
      subtitle={vehicle?.plateNumber || undefined}
      backPath="/fleet/vehicles"
      backLabel="المركبات"
      status={vehicle ? { label: statusLabel, tone: vehicleStatusTone(vehicle.status) } : undefined}
      entityType="fleet-vehicle"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={refetch}
      createdAt={vehicle?.createdAt}
      updatedAt={vehicle?.updatedAt}
      overview={overview}
      actions={actions}
      extraTabs={registryExtraTabs}
      hideTabs={[...registryHideTabs, "tasks"]}
    />
  );
}

function fuelTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    gasoline: "بنزين", diesel: "ديزل", electric: "كهربائي", hybrid: "هجين",
  };
  return labels[type] || type || "-";
}

function insuranceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    comprehensive: "شامل", third_party: "طرف ثالث", "against-others": "ضد الغير",
  };
  return labels[type] || type || "-";
}

function maintenanceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    oil_change: "تغيير زيت", tire_replacement: "استبدال إطارات",
    scheduled: "صيانة دورية", repair: "إصلاح", inspection: "فحص",
  };
  return labels[type] || type || "-";
}
