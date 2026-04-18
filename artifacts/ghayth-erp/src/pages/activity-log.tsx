import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Activity, FileText, Users, DollarSign, MessageCircle, Calendar,
  CreditCard, ClipboardList, RefreshCw,
  ChevronLeft, ChevronRight, Filter, Clock, Eye, X, ArrowRightLeft,
  Plus, Trash2, Edit, CheckCircle, XCircle, Search,
} from "lucide-react";

const ENTITY_OPTIONS = [
  { value: "all", label: "جميع الكيانات" },
  { value: "employee", label: "الموظفين" },
  { value: "client", label: "العملاء" },
  { value: "invoice", label: "الفواتير" },
  { value: "request", label: "الطلبات" },
  { value: "leave_request", label: "الإجازات" },
  { value: "expense", label: "المصروفات" },
  { value: "voucher", label: "السندات" },
  { value: "purchase_request", label: "طلبات الشراء" },
  { value: "purchase_order", label: "أوامر الشراء" },
  { value: "task", label: "المهام" },
  { value: "project", label: "المشاريع" },
  { value: "support_ticket", label: "تذاكر الدعم" },
  { value: "vehicle", label: "المركبات" },
  { value: "trip", label: "الرحلات" },
  { value: "warehouse_product", label: "المخزون" },
  { value: "communication", label: "الاتصالات" },
  { value: "property", label: "الأملاك" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "جميع الإجراءات" },
  { value: "create", label: "إنشاء" },
  { value: "update", label: "تعديل" },
  { value: "delete", label: "حذف" },
  { value: "approve", label: "اعتماد" },
  { value: "reject", label: "رفض" },
];

const ENTITY_STYLES: Record<string, { icon: typeof Activity; color: string; bg: string }> = {
  employee: { icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
  client: { icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
  invoice: { icon: CreditCard, color: "text-indigo-600", bg: "bg-indigo-50" },
  request: { icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50" },
  leave_request: { icon: Calendar, color: "text-teal-600", bg: "bg-teal-50" },
  expense: { icon: DollarSign, color: "text-red-600", bg: "bg-red-50" },
  voucher: { icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
  task: { icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50" },
  project: { icon: Activity, color: "text-cyan-600", bg: "bg-cyan-50" },
  support_ticket: { icon: MessageCircle, color: "text-pink-600", bg: "bg-pink-50" },
  communication: { icon: MessageCircle, color: "text-violet-600", bg: "bg-violet-50" },
  default: { icon: FileText, color: "text-gray-600", bg: "bg-gray-50" },
};

const ACTION_LABELS: Record<string, { label: string; icon: typeof Activity; color: string }> = {
  create: { label: "إنشاء", icon: Plus, color: "text-green-600" },
  update: { label: "تعديل", icon: Edit, color: "text-blue-600" },
  delete: { label: "حذف", icon: Trash2, color: "text-red-600" },
  approve: { label: "اعتماد", icon: CheckCircle, color: "text-green-700" },
  reject: { label: "رفض", icon: XCircle, color: "text-red-700" },
  escalate: { label: "تصعيد", icon: Activity, color: "text-purple-600" },
};

const ENTITY_LABELS: Record<string, string> = {
  employee: "موظف",
  client: "عميل",
  invoice: "فاتورة",
  request: "طلب",
  leave_request: "إجازة",
  expense: "مصروف",
  voucher: "سند",
  purchase_request: "طلب شراء",
  purchase_order: "أمر شراء",
  salary_advance: "سلفة",
  custody: "عهدة",
  vendor: "مورد",
  task: "مهمة",
  project: "مشروع",
  support_ticket: "تذكرة دعم",
  trip: "رحلة",
  vehicle: "مركبة",
  maintenance: "صيانة",
  fuel_log: "وقود",
  warehouse_product: "منتج مخزون",
  warehouse_movement: "حركة مخزون",
  crm_opportunity: "فرصة",
  crm_activity: "نشاط علاقات العملاء",
  company: "شركة",
  branch: "فرع",
  communication: "اتصال",
  property: "عقار",
  attendance: "حضور",
  violation: "مخالفة",
  official_letter: "خطاب رسمي",
  performance: "تقييم أداء",
};

function getEntityLink(entityType: string, entityId: string): string | null {
  const links: Record<string, string> = {
    invoice: `/finance/invoices/${entityId}`,
    request: `/requests`,
    leave_request: `/hr/leaves`,
    expense: `/finance/expenses`,
    voucher: `/finance/vouchers`,
    employee: `/employees/${entityId}`,
    client: `/clients/${entityId}`,
    task: `/tasks`,
    project: `/projects/${entityId}`,
    support_ticket: `/support/${entityId}`,
    communication: `/communications`,
    vehicle: `/fleet`,
    trip: `/fleet/trips`,
    warehouse_product: `/warehouse`,
    property: `/properties`,
    purchase_request: `/finance/purchase-orders`,
    purchase_order: `/finance/purchase-orders`,
  };
  return links[entityType] || null;
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return formatDateAr(timestamp);
}

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  status: "الحالة",
  email: "البريد",
  phone: "الهاتف",
  title: "العنوان",
  description: "الوصف",
  amount: "المبلغ",
  total: "الإجمالي",
  salary: "الراتب",
  department: "القسم",
  position: "المنصب",
  notes: "ملاحظات",
  address: "العنوان",
  type: "النوع",
  priority: "الأولوية",
  assignedTo: "مُسند إلى",
  dueDate: "تاريخ الاستحقاق",
  startDate: "تاريخ البدء",
  endDate: "تاريخ الانتهاء",
  days: "الأيام",
  reason: "السبب",
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "نعم" : "لا";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function DiffViewer({ changes, before, after }: { changes?: any[]; before?: any; after?: any }) {
  if (changes && Array.isArray(changes) && changes.length > 0) {
    return (
      <div className="mt-2 space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
        <div className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
          <ArrowRightLeft className="h-3 w-3" />
          التغييرات ({changes.length} حقل)
        </div>
        {changes.slice(0, 10).map((change: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-gray-600 min-w-[80px] text-start">
              {FIELD_LABELS[change.field] || change.field}:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {change.oldValue !== null && change.oldValue !== undefined && (
                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded line-through">
                  {formatValue(change.oldValue)}
                </span>
              )}
              <span className="text-gray-400">←</span>
              {change.newValue !== null && change.newValue !== undefined && (
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  {formatValue(change.newValue)}
                </span>
              )}
            </div>
          </div>
        ))}
        {changes.length > 10 && (
          <div className="text-xs text-gray-400 pt-1">و {changes.length - 10} تغييرات أخرى...</div>
        )}
      </div>
    );
  }

  if (before || after) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        {before && (
          <div className="bg-red-50 rounded-lg p-2 border border-red-100">
            <div className="text-[10px] font-semibold text-red-500 mb-1">قبل التعديل</div>
            <pre className="text-[10px] text-red-700 whitespace-pre-wrap overflow-hidden max-h-20">
              {typeof before === "object" ? JSON.stringify(before, null, 1) : String(before)}
            </pre>
          </div>
        )}
        {after && (
          <div className="bg-green-50 rounded-lg p-2 border border-green-100">
            <div className="text-[10px] font-semibold text-green-500 mb-1">بعد التعديل</div>
            <pre className="text-[10px] text-green-700 whitespace-pre-wrap overflow-hidden max-h-20">
              {typeof after === "object" ? JSON.stringify(after, null, 1) : String(after)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function ActivityLogPage() {
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const pageSize = 30;

  const { data: usersData } = useApiQuery<any>(["employees-list"], "/employees?limit=200");
  const userOptions: { value: string; label: string }[] = [
    { value: "all", label: "جميع المستخدمين" },
    ...((usersData?.data || []).map((emp: any) => ({ value: String(emp.userId || emp.id), label: emp.name })))
  ];

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page + 1));
  queryParams.set("limit", String(pageSize));
  if (entityFilter !== "all") queryParams.set("entityType", entityFilter);
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  if (userFilter !== "all") queryParams.set("userId", userFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["audit-logs-page", entityFilter, actionFilter, userFilter, dateFrom, dateTo, String(page)],
    `/audit-logs?${queryParams.toString()}`
  );

  const { data: summaryData } = useApiQuery<any>(["activity-summary"], "/activity-log/summary");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const items = data?.data || [];
  const total = data?.total || 0;
  const summary = summaryData || {};

  const alertCards = [
    { label: "طلبات معلقة", value: summary.pendingRequests || 0, icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50", link: "/requests" },
    { label: "إجازات معلقة", value: summary.pendingLeaves || 0, icon: Calendar, color: "text-teal-600", bg: "bg-teal-50", link: "/hr/leaves" },
    { label: "فواتير متأخرة", value: summary.overdueInvoices || 0, icon: CreditCard, color: "text-red-600", bg: "bg-red-50", link: "/finance/invoices" },
    { label: "تذاكر مفتوحة", value: summary.openTickets || 0, icon: MessageCircle, color: "text-purple-600", bg: "bg-purple-50", link: "/support" },
    { label: "عقود تنتهي قريباً", value: summary.expiringContracts || 0, icon: FileText, color: "text-amber-600", bg: "bg-amber-50", link: "/legal" },
    { label: "منتجات منخفضة", value: summary.lowStock || 0, icon: Activity, color: "text-blue-600", bg: "bg-blue-50", link: "/warehouse" },
  ];

  const activeAlerts = alertCards.filter(a => a.value > 0);
  const hasFilters = entityFilter !== "all" || actionFilter !== "all" || userFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setEntityFilter("all");
    setActionFilter("all");
    setUserFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  return (
    <PageShell
      title="سجل الحركات والنشاطات"
      subtitle="جميع العمليات والتغييرات عبر وحدات النظام مع تفاصيل التغييرات"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </Button>
      }
    >
      {activeAlerts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {activeAlerts.map((alert) => (
            <Link key={alert.label} href={alert.link}>
              <div className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:shadow-md transition-all ${alert.bg}`}>
                <alert.icon className={`w-5 h-5 ${alert.color}`} />
                <div>
                  <p className="text-lg font-bold text-gray-900">{alert.value}</p>
                  <p className="text-xs text-gray-600">{alert.label}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border">
        <Filter className="w-4 h-4 text-gray-400" />

        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {userOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">من</span>
          <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(0); }} className="w-36" />
          <span className="text-xs text-gray-400">إلى</span>
          <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(0); }} className="w-36" />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-gray-500"
            onClick={clearFilters}
          >
            <X className="w-3 h-3 me-1" />
            مسح الفلاتر
          </Button>
        )}

        <Badge variant="secondary" className="text-xs ms-auto">{total} سجل</Badge>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-red-600 font-medium">حدث خطأ في تحميل السجل</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">إعادة المحاولة</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {hasFilters ? "لا توجد نتائج مطابقة للفلاتر المحددة" : "لا توجد سجلات تدقيق بعد"}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {hasFilters ? "جرب تغيير معايير البحث" : "ستظهر هنا جميع العمليات التي تتم في النظام"}
              </p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">مسح الفلاتر</Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item: any) => {
                const entityStyle = ENTITY_STYLES[item.entity] || ENTITY_STYLES.default;
                const Icon = entityStyle.icon;
                const actionInfo = ACTION_LABELS[item.action] || { label: item.action, icon: Activity, color: "text-gray-600" };
                const ActionIcon = actionInfo.icon;
                const link = getEntityLink(item.entity, item.entityId);
                const isExpanded = expandedRow === item.id;
                const hasChanges = item.changes || item.before || item.after;
                const entityLabel = ENTITY_LABELS[item.entity] || item.entity;

                return (
                  <div key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-4 p-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${entityStyle.bg}`}>
                        <Icon className={`w-5 h-5 ${entityStyle.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs py-0 ${actionInfo.color}`}>
                            <ActionIcon className="w-3 h-3 me-1" />
                            {actionInfo.label}
                          </Badge>
                          <span className="font-medium text-sm text-gray-900">
                            {entityLabel} #{item.entityId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {item.userName || "النظام"}
                          </span>
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTimeAgo(item.createdAt)}
                          </span>
                          {item.reason && (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              📝 {item.reason}
                            </span>
                          )}
                          {item.scope?.approvalStep && (
                            <span className="text-xs text-indigo-600 flex items-center gap-1">
                              خطوة: {item.scope.approvalStep}
                            </span>
                          )}
                        </div>

                        {isExpanded && hasChanges && (
                          <DiffViewer
                            changes={item.changes}
                            before={item.before}
                            after={item.after}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasChanges && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                          >
                            <Eye className="w-3 h-3 me-1" />
                            {isExpanded ? "إخفاء" : "التغييرات"}
                          </Button>
                        )}
                        {link && (
                          <Link href={link}>
                            <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7 px-2">
                              عرض <ChevronLeft className="w-3 h-3 ms-1" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            عرض {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} من {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-4 h-4" /> السابق
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}>
              التالي <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
