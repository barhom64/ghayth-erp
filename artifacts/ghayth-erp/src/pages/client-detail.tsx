import { useState } from "react";
import { DetailPageLayout } from "@workspace/entity-kit";
import { PageStatusBadge } from "@workspace/ui-core";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User, Phone, Mail, FileText, Target, Headphones, FolderKanban,
  Clock, DollarSign, MessageCircle, TrendingUp, AlertTriangle,
  CheckCircle, Activity, BookOpen, CheckSquare, Globe, Plane,
} from "lucide-react";
import { useRoute } from "wouter";
import { cn } from "@/lib/utils";
import { CLASSIFICATIONS } from "@/lib/constants";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { LinkedTasks } from "@/components/shared/linked-tasks";
import { useToast } from "@/hooks/use-toast";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { z } from "zod";
import {
  FormShell, FormEmailField, FormTextField, FormGrid,
} from "@/components/form-shell";

const TABS = [
  { key: "overview", label: "نظرة شاملة", icon: Activity },
  { key: "info", label: "بطاقة العميل", icon: User },
  { key: "timeline", label: "الخط الزمني", icon: Clock },
  { key: "invoices", label: "الفواتير", icon: FileText },
  { key: "finance", label: "المالية", icon: BookOpen },
  { key: "tasks", label: "المهام", icon: CheckCircle },
  { key: "opportunities", label: "الفرص", icon: Target },
  { key: "tickets", label: "التذاكر", icon: Headphones },
  { key: "projects", label: "المشاريع", icon: FolderKanban },
  { key: "conversations", label: "المحادثات", icon: MessageCircle },
  { key: "umrah", label: "العمرة", icon: Plane },
  { key: "portal", label: "بوابة العميل", icon: Globe },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CLASSIFICATION_COLORS: Record<string, string> = {
  vip: "bg-status-warning-surface text-yellow-800 border-status-warning-surface",
  premium: "bg-purple-100 text-purple-800 border-purple-200",
  regular: "bg-status-info-surface text-status-info-foreground border-status-info-surface",
  prospect: "bg-status-success-surface text-status-success-foreground border-status-success-surface",
  churned: "bg-status-error-surface text-status-error-foreground border-status-error-surface",
};

const TIMELINE_ICONS: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  invoice: { icon: FileText, color: "text-status-info-foreground", bg: "bg-status-info-surface" },
  opportunity: { icon: Target, color: "text-status-success-foreground", bg: "bg-status-success-surface" },
  ticket: { icon: Headphones, color: "text-orange-600", bg: "bg-orange-50" },
  project: { icon: FolderKanban, color: "text-purple-600", bg: "bg-purple-50" },
};

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const id = params?.id || "";
  const { hideTabs: registryHideTabs } = useRegistryTabs("client", id ?? "");
  const { data: client, isLoading, isError } = useApiQuery<any>(["client", id], `/clients/${id}`, !!id);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const invoices: any[] = client?.invoices || [];
  const opportunities: any[] = client?.opportunities || [];
  const tickets: any[] = client?.tickets || [];
  const projects: any[] = client?.projects || [];
  const financials: any = client?.financials || {};
  const conversations: any[] = client?.conversations || [];
  const timeline: any[] = client?.timeline || [];
  const activeServices: any = client?.activeServices || {};

  const overview = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStat
          label="إجمالي الفواتير"
          value={formatCurrency(Number(financials.totalInvoiced) || 0)}
          icon={DollarSign}
          color="blue"
        />
        <QuickStat
          label="المدفوع"
          value={formatCurrency(Number(financials.totalPaid) || 0)}
          icon={CheckCircle}
          color="green"
        />
        <QuickStat
          label="المستحق"
          value={formatCurrency(Number(financials.totalOutstanding) || 0)}
          icon={AlertTriangle}
          color={Number(financials.totalOutstanding) > 0 ? "red" : "gray"}
        />
        <QuickStat
          label="فواتير متأخرة"
          value={String(Number(financials.overdueCount) || 0)}
          icon={Clock}
          color={Number(financials.overdueCount) > 0 ? "orange" : "gray"}
        />
      </div>

      {(activeServices.openTickets?.length > 0 || activeServices.activeProjects?.length > 0 || activeServices.activeContracts?.length > 0) && (
        <Card className="border-orange-100 bg-orange-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
              <Activity className="h-4 w-4" />
              خدمات نشطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(activeServices.openTickets || []).map((t: any) => (
                <Badge key={`t-${t.id}`} variant="outline" className="text-xs">
                  <Headphones className="h-3 w-3 me-1" /> {t.title || t.ref}
                </Badge>
              ))}
              {(activeServices.activeProjects || []).map((p: any) => (
                <Badge key={`p-${p.id}`} variant="outline" className="text-xs">
                  <FolderKanban className="h-3 w-3 me-1" /> {p.name}
                </Badge>
              ))}
              {(activeServices.activeContracts || []).map((c: any) => (
                <Badge key={`c-${c.id}`} variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 me-1" /> {c.title}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 border-b overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const count = tab.key === "invoices" ? invoices.length
            : tab.key === "opportunities" ? opportunities.length
            : tab.key === "tickets" ? tickets.length
            : tab.key === "projects" ? projects.length
            : tab.key === "timeline" ? timeline.length
            : tab.key === "conversations" ? conversations.length : 0;
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
            <Card className="border-0 shadow-sm bg-status-info-surface">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-status-info-foreground mb-1">إجمالي الفواتير</p>
                <p className="text-xl font-bold text-status-info-foreground">{formatCurrency(Number(financials.totalInvoiced) || 0)}</p>
                <p className="text-[10px] text-status-info">{Number(financials.invoiceCount) || 0} فاتورة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-status-success-surface">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-status-success-foreground mb-1">المدفوع</p>
                <p className="text-xl font-bold text-status-success-foreground">{formatCurrency(Number(financials.totalPaid) || 0)}</p>
                <p className="text-[10px] text-status-success">{Number(financials.paidCount) || 0} مدفوعة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-status-error-surface">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-status-error-foreground mb-1">المستحق</p>
                <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(financials.totalOutstanding) || 0)}</p>
                <p className="text-[10px] text-status-error">{Number(financials.overdueCount) || 0} متأخرة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-purple-50/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-purple-600 mb-1">الفرص</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(opportunities.reduce((s: number, o: any) => s + Number(o.value || 0), 0))}</p>
                <p className="text-[10px] text-purple-500">{opportunities.length} فرصة</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="w-4 h-4 text-status-info" /> بيانات العميل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">الاسم</p>
                    <p className="font-medium">{client?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">التصنيف</p>
                    <Badge className={cn("text-xs", CLASSIFICATION_COLORS[client?.classification] || "bg-surface-subtle")}>
                      {CLASSIFICATIONS[client?.classification] || client?.classification || "-"}
                    </Badge>
                  </div>
                  {client?.phone && <div>
                    <p className="text-xs text-muted-foreground">الجوال</p>
                    <p className="font-medium" dir="ltr">{client?.phone}</p>
                  </div>}
                  {client?.email && <div>
                    <p className="text-xs text-muted-foreground">البريد</p>
                    <p className="font-medium text-xs">{client?.email}</p>
                  </div>}
                  <div>
                    <p className="text-xs text-muted-foreground">المصدر</p>
                    <p className="font-medium">{client?.source || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">تاريخ الإنشاء</p>
                    <p className="font-medium">{client?.createdAt ? formatDateAr(client?.createdAt) : "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" /> ملخص النشاط
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-2 rounded-lg bg-status-info-surface text-center">
                    <p className="text-lg font-bold text-status-info-foreground">{invoices.length}</p>
                    <p className="text-[10px] text-status-info-foreground">فاتورة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-status-success-surface text-center">
                    <p className="text-lg font-bold text-status-success-foreground">{opportunities.length}</p>
                    <p className="text-[10px] text-status-success-foreground">فرصة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-50 text-center">
                    <p className="text-lg font-bold text-orange-700">{tickets.length}</p>
                    <p className="text-[10px] text-orange-600">تذكرة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-50 text-center">
                    <p className="text-lg font-bold text-purple-700">{projects.length}</p>
                    <p className="text-[10px] text-purple-600">مشروع</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {Number(financials.overdueCount) > 0 && (
            <Card className="border-status-error-surface bg-status-error-surface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-status-error-foreground">
                  <AlertTriangle className="w-4 h-4" /> فواتير متأخرة ({financials.overdueCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invoices.filter((inv: any) => inv.status === "overdue").slice(0, 3).map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg border border-status-error-surface">
                      <div>
                        <p className="text-sm font-mono">{inv.ref}</p>
                        <p className="text-xs text-status-error">{inv.createdAt ? formatDateAr(inv.createdAt) : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{formatCurrency(Number(inv.total || 0))}</p>
                        <p className="text-xs text-muted-foreground">مدفوع: {formatCurrency(Number(inv.paidAmount || 0))}</p>
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
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                بيانات العميل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="الاسم" value={client?.name} />
              <InfoRow label={<span className="flex items-center gap-2"><Phone className="h-4 w-4" /> الجوال</span>} value={client?.phone || "-"} dir="ltr" />
              <InfoRow label={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> البريد</span>} value={client?.email || "-"} />
              <InfoRow label="التصنيف" value={CLASSIFICATIONS[client?.classification] || client?.classification || "-"} />
              <InfoRow label="المصدر" value={client?.source || "-"} />
              {client?.code && <InfoRow label="الرمز" value={client?.code} />}
              <InfoRow label="إجمالي الإيرادات الفعلية" value={formatCurrency(Number(client?.totalRevenue) || 0)} bold />
              <InfoRow label="الإيرادات المتوقعة" value={formatCurrency(Number(client?.expectedRevenue) || 0)} />
              <InfoRow label="تاريخ الإنشاء" value={client?.createdAt ? formatDateAr(client?.createdAt) : "-"} last />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  ملخص مالي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <FinancialItem label="إجمالي الفواتير" value={Number(financials.invoiceCount) || 0} sub={formatCurrency(Number(financials.totalInvoiced) || 0)} color="blue" />
                  <FinancialItem label="مدفوعة" value={Number(financials.paidCount) || 0} sub={formatCurrency(Number(financials.totalPaid) || 0)} color="green" />
                  <FinancialItem label="مستحقة" value={Number(financials.overdueCount) || 0} sub={formatCurrency(Number(financials.totalOutstanding) || 0)} color="red" />
                  <FinancialItem label="الفرص" value={opportunities.length} sub={formatCurrency(opportunities.reduce((s: number, o: any) => s + Number(o.value || 0), 0))} color="purple" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">ملخص النشاط</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <SummaryItem label="الفواتير" value={invoices.length} color="blue" />
                  <SummaryItem label="الفرص" value={opportunities.length} color="green" />
                  <SummaryItem label="التذاكر" value={tickets.length} color="orange" />
                  <SummaryItem label="المشاريع" value={projects.length} color="purple" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              الخط الزمني ({timeline.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد نشاط مسجل</p>
            ) : (
              <div className="relative">
                <div className="absolute top-0 bottom-0 end-4 w-px bg-gray-200" />
                <div className="space-y-4">
                  {timeline.map((item: any, idx: number) => {
                    const config = TIMELINE_ICONS[item.type] || TIMELINE_ICONS.invoice;
                    const Icon = config.icon;
                    return (
                      <div key={idx} className="flex gap-4 relative">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10", config.bg)}>
                          <Icon className={cn("h-4 w-4", config.color)} />
                        </div>
                        <div className="flex-1 bg-white border rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-medium text-muted-foreground uppercase">{item.type}</span>
                              <p className="font-medium text-sm">{item.ref}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <PageStatusBadge status={item.status} />
                              {item.detail && (
                                <span className="text-xs text-muted-foreground">{item.detail}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.createdAt ? formatDateAr(item.createdAt) : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الفواتير ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد فواتير</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-mono font-medium">{inv.ref}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.createdAt ? formatDateAr(inv.createdAt) : "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PageStatusBadge status={inv.status} />
                      <span className="font-bold">{formatCurrency(Number(inv.total || 0))}</span>
                      <span className="text-xs text-muted-foreground">
                        مدفوع: {formatCurrency(Number(inv.paidAmount || 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "finance" && id && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-status-info-foreground" />
                الملف المالي الشامل للعميل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="client" entityId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">دفتر الأستاذ المساعد</CardTitle>
            </CardHeader>
            <CardContent>
              <FinancialTab entityType="client" entityId={id} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "tasks" && id && (
        <LinkedTasks entityType="client" entityId={id} />
      )}

      {activeTab === "opportunities" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">فرص المبيعات ({opportunities.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد فرص</p>
            ) : (
              <div className="space-y-3">
                {opportunities.map((opp: any) => (
                  <div key={opp.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{opp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        المرحلة: {opp.stage} — الاحتمالية: {opp.probability}%
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PageStatusBadge status={opp.status || opp.stage} />
                      <span className="font-bold">{formatCurrency(Number(opp.value || 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "tickets" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">تذاكر الدعم ({tickets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد تذاكر</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.ref}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "projects" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">المشاريع ({projects.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد مشاريع</p>
            ) : (
              <div className="space-y-3">
                {projects.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.startDate ? formatDateAr(p.startDate) : "-"}
                        {p.endDate ? ` — ${formatDateAr(p.endDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PageStatusBadge status={p.status} />
                      {p.budget > 0 && <span className="font-bold text-sm">{formatCurrency(Number(p.budget))}</span>}
                      {p.progress !== undefined && p.progress !== null && (
                        <span className="text-xs text-muted-foreground">{p.progress}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "conversations" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
              المحادثات ({conversations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد محادثات</p>
            ) : (
              <div className="space-y-3">
                {conversations.map((msg: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {msg.channel === "whatsapp" ? "واتساب" : msg.channel === "sms" ? "رسالة نصية" : msg.channel}
                        </Badge>
                        <PageStatusBadge status={msg.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {msg.createdAt ? formatDateAr(msg.createdAt) : ""}
                      </span>
                    </div>
                    <p className="text-sm">{msg.message}</p>
                    {msg.phone && <p className="text-xs text-muted-foreground mt-1" dir="ltr">{msg.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "umrah" && id && (
        <UmrahTab clientId={id} />
      )}

      {activeTab === "portal" && id && (
        <ClientPortalTab clientId={id} clientEmail={client?.email} />
      )}
    </div>
  );

  return (
    <DetailPageLayout
      title="ملف العميل 360°"
      subtitle={client?.name}
      backPath="/crm/clients"
      entityType="client"
      entityId={id || ""}
      overview={overview}
      isLoading={isLoading}
      error={isError ? new Error("خطأ في تحميل بيانات العميل") : undefined}
      onRetry={() => {}}
      hideTabs={[...new Set(["tasks" as const, ...registryHideTabs])]}
      actions={
        <>
          {client && (
            <Badge className={cn("text-sm px-3 py-1", CLASSIFICATION_COLORS[client?.classification] || "bg-surface-subtle")}>
              {CLASSIFICATIONS[client?.classification] || client?.classification}
            </Badge>
          )}
          {client?.isBlacklisted && (
            <Badge variant="destructive" className="text-sm px-3 py-1">قائمة سوداء</Badge>
          )}
        </>
      }
    />
  );
}

function ClientPortalTab({ clientId, clientEmail }: { clientId: string; clientEmail?: string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<any>(
    ["portal-account", clientId],
    `/clients/${clientId}/portal-account`
  );
  const createMut = useApiMutation<any, any>(`/clients/${clientId}/portal-account`, "POST", [["portal-account", clientId]]);
  const updateMut = useApiMutation<any, any>(`/clients/${clientId}/portal-account`, "PATCH", [["portal-account", clientId]]);

  // Schema enforces email validity client-side AND password min length.
  // Old guard was `if (!form.email || !form.password)` which accepted
  // "x" + "1" as valid. Server still re-validates.
  const portalSchema = z.object({
    email: z.string().email("بريد إلكتروني غير صالح"),
    password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
  });
  type PortalForm = z.infer<typeof portalSchema>;

  const [resetPassword, setResetPassword] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const account = data?.account;

  const handleCreate = async (values: PortalForm) => {
    try {
      await createMut.mutateAsync({ email: values.email, password: values.password });
      toast({ title: "تم إنشاء حساب البوابة بنجاح" });
      setShowCreate(false);
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message || "خطأ في إنشاء الحساب" });
    }
  };

  const handleToggleActive = async () => {
    try {
      await updateMut.mutateAsync({ isActive: !account.isActive });
      toast({ title: account.isActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message || "خطأ في تحديث الحساب" });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      toast({ variant: "destructive", title: "يرجى إدخال كلمة مرور جديدة (6 أحرف على الأقل)" });
      return;
    }
    try {
      await updateMut.mutateAsync({ password: resetPassword });
      toast({ title: "تم تعيين كلمة المرور الجديدة، سيُطلب من العميل تغييرها عند الدخول التالي" });
      setResetPassword("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message || "خطأ في تعيين كلمة المرور" });
    }
  };

  if (isLoading) {
    return <Card><CardContent className="py-8"><div className="h-8 bg-muted rounded animate-pulse w-48" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-5 w-5 text-status-info-foreground" />
          بوابة العميل الإلكترونية
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!account ? (
          <div className="space-y-4">
            <div className="bg-status-info-surface border border-status-info-surface rounded-lg p-4">
              <p className="text-sm text-status-info-foreground">لا يوجد حساب بوابة لهذا العميل بعد. يمكنك إنشاء حساب يتيح له الدخول إلى بوابة العملاء ومتابعة فواتيره وطلباته.</p>
            </div>
            {!showCreate ? (
              <GuardedButton perm="clients:create" onClick={() => setShowCreate(true)} className="gap-2">
                <Globe className="h-4 w-4" />
                إنشاء حساب بوابة
              </GuardedButton>
            ) : (
              <div className="space-y-3 border rounded-lg p-4">
                <p className="text-sm font-semibold">إنشاء حساب بوابة للعميل</p>
                <FormShell
                  schema={portalSchema}
                  defaultValues={{ email: clientEmail || "", password: "" }}
                  submitLabel="إنشاء الحساب"
                  secondaryActions={
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                      إلغاء
                    </Button>
                  }
                  onSubmit={async (values, ctx) => {
                    await handleCreate(values);
                    ctx.reset();
                  }}
                >
                  <FormGrid cols={2}>
                    <FormEmailField name="email" label="البريد الإلكتروني" required placeholder="client@example.com" />
                    <FormTextField name="password" label="كلمة المرور المؤقتة" required placeholder="6 أحرف على الأقل" />
                  </FormGrid>
                  <p className="text-xs text-muted-foreground mt-2">سيُطلب من العميل تغيير كلمة المرور عند أول دخول</p>
                </FormShell>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-status-success-surface border border-status-success-surface rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-status-success-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-status-success-foreground">الحساب مُفعَّل</p>
                <p className="text-xs text-status-success-foreground mt-0.5">البريد: <span dir="ltr">{account.email}</span></p>
                {account.lastLoginAt && (
                  <p className="text-xs text-status-success-foreground">آخر دخول: {formatDateAr(account.lastLoginAt)}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <GuardedButton
                perm="clients:create"
                variant="outline"
                size="sm"
                onClick={handleToggleActive}
                disabled={updateMut.isPending}
                className={account.isActive ? "text-status-error-foreground hover:text-status-error-foreground border-status-error-surface" : "text-status-success-foreground hover:text-status-success-foreground border-status-success-surface"}
              >
                {account.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
              </GuardedButton>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold">إعادة تعيين كلمة المرور</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="كلمة المرور الجديدة"
                  className="flex-1"
                />
                <GuardedButton perm="clients:create" size="sm" variant="outline" onClick={handleResetPassword} disabled={updateMut.isPending}>
                  تعيين
                </GuardedButton>
              </div>
              <p className="text-xs text-muted-foreground">سيُطلب من العميل تغيير كلمة المرور عند أول دخول بعد إعادة التعيين</p>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" />
              رابط بوابة العميل:
              <a href="/portal/" target="_blank" rel="noopener noreferrer" className="text-status-info-foreground hover:underline" dir="ltr">
                /portal/
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UmrahTab({ clientId }: { clientId: string }) {
  const { data, isLoading } = useApiQuery<any>(["umrah-client", clientId], clientId ? `/umrah/sub-agents?clientId=${clientId}` : null);
  const subAgents: any[] = data?.rows ?? data ?? [];

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  if (!subAgents.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Plane className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p>لا يوجد ربط عمرة لهذا العميل</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {subAgents.map((sa: any) => (
        <Card key={sa.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plane className="h-4 w-4 text-emerald-600" />
              {sa.name || sa.nuskCode || `وكيل فرعي #${sa.id}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-2 rounded-lg bg-emerald-50 text-center">
                <p className="text-lg font-bold text-emerald-700">{sa.pilgrimCount ?? sa.totalMutamers ?? 0}</p>
                <p className="text-[10px] text-emerald-600">معتمر</p>
              </div>
              <div className="p-2 rounded-lg bg-status-info-surface text-center">
                <p className="text-lg font-bold text-status-info-foreground">{sa.groupCount ?? 0}</p>
                <p className="text-[10px] text-status-info-foreground">مجموعة</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-50 text-center">
                <p className="text-lg font-bold text-orange-700">{sa.violationCount ?? 0}</p>
                <p className="text-[10px] text-orange-600">مخالفة</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50 text-center">
                <p className="text-lg font-bold text-purple-700">{formatCurrency(Number(sa.totalInvoiced ?? 0))}</p>
                <p className="text-[10px] text-purple-600">إجمالي فواتير</p>
              </div>
            </div>
            {sa.invoices?.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">آخر الفواتير</p>
                {sa.invoices.slice(0, 3).map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded border text-sm">
                    <div>
                      <span className="font-mono text-xs">{inv.ref}</span>
                      <span className="text-xs text-muted-foreground ms-2">{inv.invoiceDate ? formatDateAr(inv.invoiceDate) : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={inv.status} />
                      <span className="font-bold text-xs">{formatCurrency(Number(inv.total ?? 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InfoRow({ label, value, dir, bold, last }: {
  label: React.ReactNode; value: string; dir?: string; bold?: boolean; last?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3 py-2", !last && "border-b")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("col-span-2", bold && "font-bold")} dir={dir}>{value}</span>
    </div>
  );
}

function QuickStat({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof DollarSign; color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: "bg-status-info-surface", text: "text-status-info-foreground", icon: "text-status-info" },
    green: { bg: "bg-status-success-surface", text: "text-status-success-foreground", icon: "text-status-success" },
    red: { bg: "bg-status-error-surface", text: "text-status-error-foreground", icon: "text-status-error" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", icon: "text-orange-500" },
    gray: { bg: "bg-surface-subtle", text: "text-status-neutral-foreground", icon: "text-muted-foreground" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", icon: "text-purple-500" },
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <div className={cn("rounded-xl border p-3 text-center", c.bg)}>
      <Icon className={cn("h-5 w-5 mx-auto mb-1", c.icon)} />
      <p className={cn("text-lg font-bold", c.text)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function FinancialItem({ label, value, sub, color }: {
  label: string; value: number; sub: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "border-status-info-surface",
    green: "border-status-success-surface",
    red: "border-status-error-surface",
    purple: "border-purple-100",
  };
  return (
    <div className={cn("p-3 rounded-lg border", colorMap[color] || "border-border")}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs font-medium mt-1">{sub}</p>
    </div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-status-info-surface text-status-info-foreground border-status-info-surface",
    green: "bg-status-success-surface text-status-success-foreground border-status-success-surface",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };
  return (
    <div className={cn("p-4 rounded-xl border text-center", colorMap[color] || "bg-surface-subtle")}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-status-error-surface text-status-error-foreground",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-status-warning-surface text-yellow-800",
    low: "bg-status-success-surface text-status-success-foreground",
  };
  const labels: Record<string, string> = {
    critical: "حرج",
    high: "عالي",
    medium: "متوسط",
    low: "منخفض",
  };
  return (
    <Badge className={cn("text-[10px]", colors[priority] || "bg-surface-subtle text-status-neutral-foreground")}>
      {labels[priority] || priority}
    </Badge>
  );
}
