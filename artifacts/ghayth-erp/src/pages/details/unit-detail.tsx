import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import {
  Building, FileText, Banknote, Wrench, Users, Clock, DollarSign,
  ArrowRight, AlertTriangle, CheckCircle, XCircle, Info, Pencil,
  Compass, Paintbrush, Star, Image as ImageIcon, MapPin, BedDouble, Bath, Maximize2
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { LinkedTasks } from "@/components/shared/linked-tasks";
import { CheckSquare, BookOpen } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const TABS = [
  { key: "overview", label: "نظرة شاملة", icon: Building },
  { key: "contracts", label: "العقود", icon: FileText },
  { key: "payments", label: "المدفوعات والمتأخرات", icon: Banknote },
  { key: "maintenance", label: "الصيانة", icon: Wrench },
  { key: "finance", label: "الملف المالي", icon: BookOpen },
  { key: "tasks", label: "المهام", icon: CheckSquare },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "timeline", label: "السجل الزمني", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "rented", label: "مؤجرة" },
  { value: "maintenance", label: "تحت صيانة" },
  { value: "reserved", label: "محجوزة" },
  { value: "defaulted", label: "متعثرة" },
  { value: "expired", label: "منتهي العقد" },
];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rented: "bg-blue-100 text-blue-700 border-blue-200",
  maintenance: "bg-amber-100 text-amber-700 border-amber-200",
  reserved: "bg-purple-100 text-purple-700 border-purple-200",
  defaulted: "bg-red-100 text-red-700 border-red-200",
  expired: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة",
  rented: "مؤجرة",
  maintenance: "تحت صيانة",
  reserved: "محجوزة",
  defaulted: "متعثرة",
  expired: "منتهي العقد",
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
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  critical: "bg-red-50 border-red-200 text-red-800",
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

  const { data: unit, isLoading, isError, error } = useApiQuery<any>(
    ["unit-detail", id || ""],
    `/properties/units/${id}`,
    !!id
  );

  const is404 = isError && (error?.message?.includes("غير موجود") || error?.message?.includes("404"));

  const shellBreadcrumbs = [
    { href: "/properties/dashboard", label: "إدارة الأملاك" },
    { href: "/properties", label: "الوحدات" },
  ];

  if (isLoading) {
    return (
      <PageShell title="جاري التحميل..." breadcrumbs={shellBreadcrumbs}>
        <Card><CardContent className="py-12"><LoadingSpinner /></CardContent></Card>
      </PageShell>
    );
  }

  if (is404 || (!isLoading && !unit)) {
    return (
      <PageShell title="الوحدة غير موجودة" breadcrumbs={shellBreadcrumbs}>
        <Card>
          <CardContent className="py-12 text-center">
            <Building className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 mb-1">الوحدة المطلوبة غير موجودة أو تم حذفها.</p>
            <p className="text-sm text-muted-foreground mb-4">تأكد من صحة الرابط أو ارجع لقائمة الوحدات.</p>
            <Link href="/properties"><Button variant="outline"><ArrowRight className="h-4 w-4 me-1" /> العودة للوحدات</Button></Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="خطأ" breadcrumbs={shellBreadcrumbs}>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-red-300" />
            <p className="text-gray-500 mb-4">حدث خطأ أثناء تحميل بيانات الوحدة.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const contracts: any[] = unit.contracts || [];
  const payments: any[] = unit.payments || [];
  const maintenance: any[] = unit.maintenance || [];
  const activeContract = contracts.find((c: any) => c.status === "active");
  const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());
  const totalCollected = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);


  return (
    <PageShell
      title={`وحدة ${unit.unitNumber}`}
      subtitle={`${unit.buildingName || "-"}${unit.address ? ` — ${unit.address}` : ""}`}
      loading={isLoading}
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { href: "/properties", label: "الوحدات" }]}
      actions={
        <div className="flex items-center gap-2">
          <Badge className={cn("border", STATUS_COLORS[unit.status] || "bg-gray-100 text-gray-700")}>
            {STATUS_LABELS[unit.status] || unit.status}
          </Badge>
          <Link href={`/properties/${id}/status`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Pencil className="h-3.5 w-3.5" /> تغيير الحالة
            </Button>
          </Link>
          <Link href="/properties">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building className="h-4 w-4 text-blue-500" /> هوية الوحدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
            <div className="flex items-start gap-2">
              <Maximize2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">المساحة</p>
                <p className="font-medium">{unit.area ? `${unit.area} م²` : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BedDouble className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">غرف / حمامات</p>
                <p className="font-medium">{unit.bedrooms || 0} غرف · {unit.bathrooms || 0} حمام</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Compass className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">الاتجاه</p>
                <p className="font-medium">{unit.direction ? DIRECTION_LABELS[unit.direction] || unit.direction : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Paintbrush className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">التشطيب</p>
                <p className="font-medium">{unit.finishing ? FINISHING_LABELS[unit.finishing] || unit.finishing : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">الطابق</p>
                <p className="font-medium">{unit.floor !== undefined && unit.floor !== null ? `الطابق ${unit.floor}` : "—"}</p>
              </div>
            </div>
            {unit.buildingName && (
              <div className="flex items-start gap-2">
                <Building className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">المبنى</p>
                  <p className="font-medium">{unit.buildingName}</p>
                </div>
              </div>
            )}
            {unit.address && (
              <div className="col-span-2 flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">العنوان</p>
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
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Star className="h-3.5 w-3.5" /> المرافق والمميزات</p>
                <div className="flex flex-wrap gap-1.5">
                  {amenities.map((a: string) => (
                    <span key={a} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs">{a}</span>
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
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> صور الوحدة</p>
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
            <p className="text-xs text-gray-500 mb-1">النوع</p>
            <p className="text-lg font-bold">{typeLabel(unit.type)}</p>
            <p className="text-xs text-gray-400">{unit.area ? `${unit.area} م²` : ""} {unit.floor ? `— الطابق ${unit.floor}` : ""}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">الإيجار الشهري</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(unit.monthlyRent || 0)}</p>
            {activeContract && <p className="text-xs text-gray-400">مستأجر: {activeContract.tenantName}</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">إجمالي التحصيل</p>
            <p className="text-lg font-bold">{formatCurrency(totalCollected)}</p>
            {overduePayments.length > 0 && (
              <p className="text-xs text-red-500">{overduePayments.length} دفعة متأخرة</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">العقود</p>
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
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                ملخص الإيرادات
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(totalExpected)}</p>
                  <p className="text-[10px] text-gray-500">المتوقع تحصيله</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
                  <p className="text-[10px] text-gray-500">المحصل فعليا</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-red-600">{formatCurrency(totalExpected - totalCollected)}</p>
                  <p className="text-[10px] text-gray-500">المتبقي</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(totalMaintCost)}</p>
                  <p className="text-[10px] text-gray-500">تكلفة الصيانة</p>
                </div>
                <div className="text-center p-2 bg-white rounded-lg border">
                  <p className={cn("text-lg font-bold", netRevenue >= 0 ? "text-emerald-600" : "text-red-600")}>{formatCurrency(netRevenue)}</p>
                  <p className="text-[10px] text-gray-500">صافي الإيرادات</p>
                </div>
              </div>
              {collectionRate > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>نسبة التحصيل</span>
                    <span className="font-bold">{collectionRate}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", collectionRate >= 80 ? "bg-emerald-500" : collectionRate >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(collectionRate, 100)}%` }} />
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
            <Card className="border-0 shadow-sm bg-red-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-red-600 mb-1">المتأخرات</p>
                <p className="text-xl font-bold text-red-700">{formatCurrency(overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0))}</p>
                <p className="text-[10px] text-red-500">{overduePayments.length} دفعة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-orange-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-orange-600 mb-1">تكلفة الصيانة</p>
                <p className="text-xl font-bold text-orange-700">{formatCurrency(maintenance.reduce((s: number, m: any) => s + Number(m.cost || 0), 0))}</p>
                <p className="text-[10px] text-orange-500">{maintenance.length} طلب</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-blue-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-blue-600 mb-1">نسبة الإشغال</p>
                <p className="text-xl font-bold text-blue-700">
                  {activeContract ? "100%" : "0%"}
                </p>
                <p className="text-[10px] text-blue-500">{activeContract ? "مؤجرة حالياً" : "شاغرة"}</p>
              </CardContent>
            </Card>
          </div>

          {activeContract && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" /> المستأجر الحالي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">الاسم</p>
                    <p className="font-medium">{activeContract.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">بداية العقد</p>
                    <p className="font-medium">{formatDateAr(activeContract.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">نهاية العقد</p>
                    <p className="font-medium">{formatDateAr(activeContract.endDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">الإيجار الشهري</p>
                    <p className="font-medium text-emerald-600">{formatCurrency(Number(activeContract.monthlyRent || 0))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {overduePayments.length > 0 && (
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" /> دفعات متأخرة ({overduePayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable<any>
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "الاستحقاق", render: (p) => <span className="text-red-600">{formatDateAr(p.dueDate)}</span> },
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
                      <div key={p.id || idx} className={cn("flex items-center justify-between p-2 rounded-lg border text-sm", paid ? "border-green-100 bg-green-50/30" : "border-gray-100")}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", paid ? "bg-green-500" : "bg-gray-400")} />
                          <div>
                            <p className="text-xs">{p.tenantName || "مستأجر"}</p>
                            <p className="text-[10px] text-gray-500">{formatDateAr(p.dueDate)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-bold text-xs", paid ? "text-green-700" : "text-gray-700")}>{formatCurrency(Number(p.amount || 0))}</p>
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
                  <FileText className="w-4 h-4 text-blue-500" /> تاريخ العقود
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pr-4">
                  {contracts.slice(0, 5).map((c: any, idx: number) => (
                    <div key={c.id || idx} className="relative flex gap-3 pb-4 last:pb-0">
                      <div className="absolute right-0 top-1 w-2 h-2 rounded-full bg-blue-500" />
                      {idx < Math.min(contracts.length, 5) - 1 && <div className="absolute right-[3px] top-3 w-0.5 h-full bg-blue-200" />}
                      <div className="mr-4 flex-1 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{c.tenantName}</p>
                          <p className="text-xs text-gray-500">{formatDateAr(c.startDate)} → {formatDateAr(c.endDate)}</p>
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
              <p className="text-center text-gray-400 py-8">لا توجد عقود</p>
            ) : (
              <DataTable<any>
                columns={[
                  { key: "tenantName", header: "المستأجر", render: (c) => <span className="font-medium">{c.tenantName}</span> },
                  { key: "startDate", header: "من", render: (c) => <span className="text-gray-500">{formatDateAr(c.startDate)}</span> },
                  { key: "endDate", header: "إلى", render: (c) => <span className="text-gray-500">{formatDateAr(c.endDate)}</span> },
                  { key: "monthlyRent", header: "الإيجار", render: (c) => <span className="font-bold">{formatCurrency(Number(c.monthlyRent || 0))}</span> },
                  { key: "totalPaid", header: "المحصل", render: (c) => <span className="text-emerald-600">{formatCurrency(Number(c.totalPaid || 0))}</span> },
                  { key: "status", header: "الحالة", render: (c) => <PageStatusBadge status={c.status} /> },
                ]}
                data={contracts}
                rowClassName={(c) => cn(c.status === "active" && "bg-blue-50/30")}
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
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 w-4" /> دفعات متأخرة ({overduePayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable<any>
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "تاريخ الاستحقاق", render: (p) => <span className="text-red-600">{formatDateAr(p.dueDate)}</span> },
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
                <p className="text-center text-gray-400 py-8">لا توجد مدفوعات</p>
              ) : (
                <DataTable<any>
                  columns={[
                    { key: "tenantName", header: "المستأجر" },
                    { key: "dueDate", header: "تاريخ الاستحقاق", render: (p) => <span className="text-gray-500">{formatDateAr(p.dueDate)}</span> },
                    { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
                    { key: "paidAmount", header: "المدفوع", render: (p) => <span className="text-emerald-600">{formatCurrency(Number(p.paidAmount || 0))}</span> },
                    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
                  ]}
                  data={payments}
                  rowClassName={(p) => cn(p.status !== "paid" && new Date(p.dueDate) < new Date() && "bg-red-50/30")}
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
              <p className="text-center text-gray-400 py-8">لا توجد سجلات صيانة</p>
            ) : (
              <DataTable<any>
                columns={[
                  { key: "category", header: "الفئة", render: (m) => <span className="font-medium">{m.category || "-"}</span> },
                  { key: "description", header: "الوصف", render: (m) => <span className="text-gray-500 max-w-xs truncate block">{m.description || "-"}</span> },
                  { key: "priority", header: "الأولوية", render: (m) => <PageStatusBadge status={m.priority} /> },
                  { key: "status", header: "الحالة", render: (m) => <PageStatusBadge status={m.status} /> },
                  { key: "actualCost", header: "التكلفة", render: (m) => <span className="text-gray-500">{m.actualCost != null ? formatCurrency(Number(m.actualCost)) : "-"}</span> },
                  { key: "materialsUsed", header: "المواد المستخدمة", render: (m) => {
                    const materials = m.materialsUsed ? (typeof m.materialsUsed === "string" ? JSON.parse(m.materialsUsed) : m.materialsUsed) : [];
                    return materials.length > 0 ? (
                      <ul className="list-disc list-inside text-xs text-gray-500">
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
                <BookOpen className="h-4 w-4 text-blue-600" />
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
        <LinkedTasks entityType="property_unit" entityId={id} includeMaintenanceTasks />
      )}

      {activeTab === "documents" && id && (
        <EntityDocuments entityType="property_unit" entityId={id} />
      )}

      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" /> السجل الزمني
            </CardTitle>
          </CardHeader>
          <CardContent>
            {id && <EntityTimeline entityType="property_units" entityId={id} maxItems={30} />}
          </CardContent>
        </Card>
      )}

    </PageShell>
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
