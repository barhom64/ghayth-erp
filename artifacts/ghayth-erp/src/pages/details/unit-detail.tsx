import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@workspace/ui-core";
import {
  Building, FileText, Banknote, Wrench, Users, DollarSign,
  AlertTriangle, XCircle, Info, Pencil,
  Compass, Paintbrush, Star, Image as ImageIcon, MapPin, BedDouble, Bath, Maximize2
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import { EntityObligations } from "@/components/shared/entity-obligations";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { LinkedTasks } from "@/components/shared/linked-tasks";
import { CheckSquare, BookOpen } from "lucide-react";
import { DetailPageLayout } from "@workspace/entity-kit";
import { EntityComments } from "@workspace/entity-kit";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";

const TABS = [
  { key: "overview", label: "نظرة شاملة", icon: Building },
  { key: "contracts", label: "العقود", icon: FileText },
  { key: "payments", label: "المدفوعات والمتأخرات", icon: Banknote },
  { key: "maintenance", label: "الصيانة", icon: Wrench },
  { key: "finance", label: "الملف المالي", icon: BookOpen },
  { key: "tasks", label: "المهام", icon: CheckSquare },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "rented", label: "مؤجرة" },
  { value: "maintenance", label: "تحت صيانة" },
  { value: "reserved", label: "محجوزة" },
  { value: "under_maintenance", label: "تحت الصيانة" },
  { value: "out_of_service", label: "خارج الخدمة" },
];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rented: "bg-status-info-surface text-status-info-foreground border-status-info-surface",
  maintenance: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
  reserved: "bg-purple-100 text-purple-700 border-purple-200",
  under_maintenance: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
  out_of_service: "bg-status-error-surface text-status-error-foreground border-status-error-surface",
};

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة",
  rented: "مؤجرة",
  maintenance: "تحت صيانة",
  reserved: "محجوزة",
  under_maintenance: "تحت الصيانة",
  out_of_service: "خارج الخدمة",
};

const DIRECTION_LABELS: Record<string, string> = {
  north: "شمالي", south: "جنوبي", east: "شرقي", west: "غربي",
  north_east: "شمالي شرقي", north_west: "شمالي غربي",
  south_east: "جنوبي شرقي", south_west: "جنوبي غربي",
};

const FINISHING_LABELS: Record<string, string> = {
  shell: "هيكل", semi_finished: "نصف تشطيب", finished: "تشطيب كامل",
  luxury: "تشطيب فاخر", furnished: "مفروشة",
};

const IMPACT_ICONS = {
  financial: Banknote,
  operational: Building,
  legal: FileText,
  notification: AlertTriangle,
};

const SEVERITY_COLORS = {
  info: "bg-status-info-surface border-status-info-surface text-status-info-foreground",
  warning: "bg-status-warning-surface border-status-warning-surface text-status-warning-foreground",
  critical: "bg-status-error-surface border-status-error-surface text-status-error-foreground",
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
};

export default function UnitDetail() {
  const [, params] = useRoute("/properties/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { hideTabs: registryHideTabs } = useRegistryTabs("property_unit", id ?? 0);

  const { data: unit, isLoading, isError, error } = useApiQuery<any>(
    ["unit-detail", id || ""],
    `/properties/units/${id}`,
    !!id
  );

  const contracts: any[] = unit?.contracts || [];
  const payments: any[] = unit?.payments || [];
  const maintenance: any[] = unit?.maintenance || [];
  const activeContract = contracts.find((c: any) => c.status === "active");
  const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());
  const totalCollected = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);


  const actions = unit ? (
    <div className="flex items-center gap-2">
      <Badge className={cn("border", STATUS_COLORS[unit.status] || "bg-surface-subtle text-status-neutral-foreground")}>
        {STATUS_LABELS[unit.status] || unit.status}
      </Badge>
      <Link href={`/properties/${id}/status`}>
        <Button variant="outline" size="sm" className="gap-1">
          <Pencil className="h-3.5 w-3.5" /> تغيير الحالة
        </Button>
      </Link>
    </div>
  ) : undefined;

  const overview = unit ? (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building className="h-4 w-4 text-status-info" /> هوية الوحدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
            <div className="flex items-start gap-2">
              <Maximize2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">المساحة</p>
                <p className="font-medium">{unit.area ? `${unit.area} م²` : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BedDouble className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">غرف / حمامات</p>
                <p className="font-medium">{unit.bedrooms || 0} غرف · {unit.bathrooms || 0} حمام</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Compass className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">الاتجاه</p>
                <p className="font-medium">{unit.direction ? DIRECTION_LABELS[unit.direction] || unit.direction : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Paintbrush className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">التشطيب</p>
                <p className="font-medium">{unit.finishing ? FINISHING_LABELS[unit.finishing] || unit.finishing : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">الطابق</p>
                <p className="font-medium">{unit.floor !== undefined && unit.floor !== null ? `الطابق ${unit.floor}` : "—"}</p>
              </div>
            </div>
            {unit.buildingName && (
              <div className="flex items-start gap-2">
                <Building className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">المبنى</p>
                  <p className="font-medium">{unit.buildingName}</p>
                </div>
              </div>
            )}
            {unit.address && (
              <div className="col-span-2 flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">العنوان</p>
                  <p className="font-medium">{unit.address}</p>
                </div>
              </div>
            )}
          </div>
          {(() => {
            const amenities = unit.amenities
              ? (typeof unit.amenities === "string" ? JSON.parse(unit.amenities) : unit.amenities)
              : [];
            return amenities.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Star className="h-3.5 w-3.5" /> المرافق والمميزات</p>
                <div className="flex flex-wrap gap-1.5">
                  {amenities.map((a: string) => (
                    <span key={a} className="px-2 py-0.5 bg-status-info-surface text-status-info-foreground border border-status-info-surface rounded-full text-xs">{a}</span>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          {(() => {
            const attachments = unit.attachments
              ? (typeof unit.attachments === "string" ? JSON.parse(unit.attachments) : unit.attachments)
              : [];
            const images = attachments.filter((a: any) => a?.mimeType?.startsWith("image/") || a?.url?.match(/\.(jpg|jpeg|png|webp|gif)/i));
            return images.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> صور الوحدة</p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {images.slice(0, 10).map((img: any, i: number) => (
                    <a key={i} href={img.url || img.fileUrl} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded overflow-hidden border hover:opacity-90 transition-opacity">
                      <img src={img.url || img.fileUrl} alt={img.name || `صورة ${i+1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">النوع</p>
            <p className="text-lg font-bold">{typeLabel(unit.type)}</p>
            <p className="text-xs text-muted-foreground">{unit.area ? `${unit.area} م²` : ""} {unit.floor ? `— الطابق ${unit.floor}` : ""}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">الإيجار الشهري</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(unit.monthlyRent || 0)}</p>
            {activeContract && <p className="text-xs text-muted-foreground">مستأجر: {activeContract.tenantName}</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي التحصيل</p>
            <p className="text-lg font-bold">{formatCurrency(totalCollected)}</p>
            {overduePayments.length > 0 && (
              <p className="text-xs text-status-error">{overduePayments.length} دفعة متأخرة</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">العقود</p>
            <p className="text-lg font-bold">{contracts.length}</p>
            {activeContract && <p className="text-xs text-emerald-500">عقد ساري حتى {formatDateAr(activeContract.endDate)}</p>}
          </CardContent>
        </Card>
      </div>

      {(() => {
        const totalExpected = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        const totalMaintCost = maintenance.reduce((s: number, m: any) => s + Number(m.actualCost || 0), 0);
        const netRevenue = totalCollected - totalMaintCost;
        const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
        return (
          <Card className="border-0 shadow-sm bg-gradient-to-l from-emerald-50/30 to-white">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                ملخص الإيرادات
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-status-info-foreground">{formatCurrency(totalExpected)}</p>
                  <p className="text-[10px] text-muted-foreground">المتوقع تحصيله</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
                  <p className="text-[10px] text-muted-foreground">المحصل فعليا</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(totalExpected - totalCollected)}</p>
                  <p className="text-[10px] text-muted-foreground">المتبقي</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-status-warning-foreground">{formatCurrency(totalMaintCost)}</p>
                  <p className="text-[10px] text-muted-foreground">تكلفة الصيانة</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className={cn("text-lg font-bold", netRevenue >= 0 ? "text-emerald-600" : "text-status-error-foreground")}>{formatCurrency(netRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground">صافي الإيرادات</p>
                </div>
              </div>
              {collectionRate > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>نسبة التحصيل</span>
                    <span className="font-bold">{collectionRate}%</span>
                  </div>
                  <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", collectionRate >= 80 ? "bg-emerald-500" : collectionRate >= 50 ? "bg-status-warning-surface0" : "bg-status-error-surface0")} style={{ width: `${Math.min(collectionRate, 100)}%` }} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const count = tab.key === "contracts" ? contracts.length
            : tab.key === "payments" ? payments.length
            : tab.key === "maintenance" ? maintenance.length : 0;
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
              {count > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-emerald-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-emerald-600 mb-1">إجمالي الإيرادات</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalCollected)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-status-error-surface">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-status-error-foreground mb-1">المتأخرات</p>
                <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0))}</p>
                <p className="text-[10px] text-status-error">{overduePayments.length} دفعة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-orange-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-orange-600 mb-1">تكلفة الصيانة</p>
                <p className="text-xl font-bold text-orange-700">{formatCurrency(maintenance.reduce((s: number, m: any) => s + Number(m.cost || 0), 0))}</p>
                <p className="text-[10px] text-orange-500">{maintenance.length} طلب</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-status-info-surface">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-status-info-foreground mb-1">نسبة الإشغال</p>
                <p className="text-xl font-bold text-status-info-foreground">
                  {activeContract ? "100%" : "0%"}
                </p>
                <p className="text-[10px] text-status-info">{activeContract ? "مؤجرة حالياً" : "شاغرة"}</p>
              </CardContent>
            </Card>
          </div>

          {activeContract && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-status-info" /> المستأجر الحالي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">الاسم</p>
                    <p className="font-medium">{activeContract.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">بداية العقد</p>
                    <p className="font-medium">{formatDateAr(activeContract.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">نهاية العقد</p>
                    <p className="font-medium">{formatDateAr(activeContract.endDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الإيجار الشهري</p>
                    <p className="font-medium text-emerald-600">{formatCurrency(Number(activeContract.monthlyRent || 0))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {overduePayments.length > 0 && (
            <Card className="border-status-error-surface bg-status-error-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-status-error-foreground">
                  <AlertTriangle className="w-4 h-4" /> دفعات متأخرة ({overduePayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "الاستحقاق", render: (p) => <span className="text-status-error-foreground">{formatDateAr(p.dueDate)}</span> },
                    { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
                  ]}
                  data={overduePayments.slice(0, 3)}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              </CardContent>
            </Card>
          )}

          {payments.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" /> سجل الدفعات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {payments.slice(0, 10).map((p: any, idx: number) => {
                    const paid = p.status === "paid";
                    return (
                      <div key={p.id || idx} className={cn("flex items-center justify-between p-2 rounded-lg border text-sm", paid ? "border-status-success-surface bg-status-success-surface" : "border-border")}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", paid ? "bg-status-success-surface0" : "bg-gray-400")} />
                          <div>
                            <p className="text-xs">{p.tenantName || "مستأجر"}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDateAr(p.dueDate)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-bold text-xs", paid ? "text-status-success-foreground" : "text-status-neutral-foreground")}>{formatCurrency(Number(p.amount || 0))}</p>
                          <PageStatusBadge status={p.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {contracts.length > 1 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-status-info" /> تاريخ العقود
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pr-4">
                  {contracts.slice(0, 5).map((c: any, idx: number) => (
                    <div key={c.id || idx} className="relative flex gap-3 pb-4 last:pb-0">
                      <div className="absolute right-0 top-1 w-2 h-2 rounded-full bg-status-info-surface0" />
                      {idx < Math.min(contracts.length, 5) - 1 && <div className="absolute right-[3px] top-3 w-0.5 h-full bg-blue-200" />}
                      <div className="mr-4 flex-1 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{c.tenantName}</p>
                          <p className="text-xs text-muted-foreground">{formatDateAr(c.startDate)} → {formatDateAr(c.endDate)}</p>
                        </div>
                        <PageStatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "contracts" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" /> العقود ({contracts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {contracts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد عقود</p>
            ) : (
              <DataTable
                columns={[
                  { key: "tenantName", header: "المستأجر", render: (c) => <span className="font-medium">{c.tenantName}</span> },
                  { key: "startDate", header: "من", render: (c) => <span className="text-muted-foreground">{formatDateAr(c.startDate)}</span> },
                  { key: "endDate", header: "إلى", render: (c) => <span className="text-muted-foreground">{formatDateAr(c.endDate)}</span> },
                  { key: "monthlyRent", header: "الإيجار", render: (c) => <span className="font-bold">{formatCurrency(Number(c.monthlyRent || 0))}</span> },
                  { key: "totalPaid", header: "المحصل", render: (c) => <span className="text-emerald-600">{formatCurrency(Number(c.totalPaid || 0))}</span> },
                  { key: "status", header: "الحالة", render: (c) => <PageStatusBadge status={c.status} /> },
                ]}
                data={contracts}
                rowClassName={(c) => cn(c.status === "active" && "bg-status-info-surface")}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          {overduePayments.length > 0 && (
            <Card className="border-status-error-surface bg-status-error-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-status-error-foreground">
                  <AlertTriangle className="w-4 w-4" /> دفعات متأخرة ({overduePayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "تاريخ الاستحقاق", render: (p) => <span className="text-status-error-foreground">{formatDateAr(p.dueDate)}</span> },
                    { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
                    { key: "paidAmount", header: "المدفوع", render: (p) => <span className="text-emerald-600">{formatCurrency(Number(p.paidAmount || 0))}</span> },
                    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
                  ]}
                  data={overduePayments}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Banknote className="w-5 h-5" /> جميع المدفوعات ({payments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد مدفوعات</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "تاريخ الاستحقاق", render: (p) => <span className="text-muted-foreground">{formatDateAr(p.dueDate)}</span> },
                    { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
                    { key: "paidAmount", header: "المدفوع", render: (p) => <span className="text-emerald-600">{formatCurrency(Number(p.paidAmount || 0))}</span> },
                    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
                  ]}
                  data={payments}
                  rowClassName={(p) => cn(p.status !== "paid" && new Date(p.dueDate) < new Date() && "bg-status-error-surface")}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "maintenance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="w-5 h-5" /> الصيانة ({maintenance.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {maintenance.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد سجلات صيانة</p>
            ) : (
              <DataTable
                columns={[
                  { key: "category", header: "الفئة", render: (m) => <span className="font-medium">{m.category || "-"}</span> },
                  { key: "description", header: "الوصف", render: (m) => <span className="text-muted-foreground max-w-xs truncate block">{m.description || "-"}</span> },
                  { key: "priority", header: "الأولوية", render: (m) => <PageStatusBadge status={m.priority} /> },
                  { key: "status", header: "الحالة", render: (m) => <PageStatusBadge status={m.status} /> },
                  { key: "actualCost", header: "التكلفة", render: (m) => <span className="text-muted-foreground">{m.actualCost != null ? formatCurrency(Number(m.actualCost)) : "-"}</span> },
                  { key: "materialsUsed", header: "المواد المستخدمة", render: (m) => {
                    const materials = m.materialsUsed ? (typeof m.materialsUsed === "string" ? JSON.parse(m.materialsUsed) : m.materialsUsed) : [];
                    return materials.length > 0 ? (
                      <ul className="list-disc list-inside text-xs text-muted-foreground">
                        {materials.map((mat: any, idx: number) => (
                          <li key={idx}>{mat.name}{mat.quantity ? ` × ${mat.quantity}` : ""}{mat.cost ? ` (${formatCurrency(Number(mat.cost))})` : ""}</li>
                        ))}
                      </ul>
                    ) : "-";
                  }},
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

      {activeTab === "finance" && id && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-status-info-foreground" />
                الملف المالي الشامل للوحدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="property" entityId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">دفتر الأستاذ المساعد</CardTitle>
            </CardHeader>
            <CardContent>
              <FinancialTab entityType="property" entityId={id} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "tasks" && id && (
        <LinkedTasks entityType="property-unit" entityId={id} includeMaintenanceTasks />
      )}


      {id && <EntityComments entityType="unit" entityId={id} />}
      {id && <EntityTags entityType="unit" entityId={id} />}
    </div>
  ) : <div />;

  return (
    <DetailPageLayout
      title={`وحدة ${unit?.unitNumber || ""}`}
      subtitle={`${unit?.buildingName || "-"}${unit?.address ? ` — ${unit.address}` : ""}`}
      backPath="/properties"
      backLabel="الوحدات"
      status={{ label: STATUS_LABELS[unit?.status] || unit?.status, tone: unit?.status === "available" ? "success" : unit?.status === "rented" ? "info" : (unit?.status === "maintenance" || unit?.status === "under_maintenance") ? "warning" : unit?.status === "out_of_service" ? "destructive" : "muted" }}
      entityType="property-unit"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? error : undefined}
     
      createdAt={unit?.createdAt}
      updatedAt={unit?.updatedAt}
      hideTabs={registryHideTabs}
      overview={overview}
      actions={actions}
    />
  );
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    apartment: "شقة",
    villa: "فيلا",
    office: "مكتب",
    shop: "محل",
    warehouse: "مستودع",
    land: "أرض",
  };
  return map[type] || type || "-";
}
