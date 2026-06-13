import { useState } from "react";
import { Link } from "wouter";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Plus, DollarSign, Eye, TrendingUp, Users, BarChart2, Target, CheckCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { KpiGrid } from "@/components/shared/kpi-card";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface CampaignRoas {
  campaignId: number;
  campaignName: string;
  spent: number;
  revenue: number;
  roas: string | null;
  leadsGenerated: number;
}

function CampaignRoasDialog({ campaign, onClose }: { campaign: any | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [revenueInput, setRevenueInput] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: roas, isLoading, refetch } = useApiQuery<CampaignRoas>(
    ["campaign-roas", String(campaign?.id ?? "")],
    campaign ? `/marketing/campaigns/${campaign.id}/roas` : "",
    !!campaign,
  );

  // GET /marketing/campaigns/:id — full campaign row including
  // status/budget/spend/channel/period info. The list view only fetches
  // summary fields; load this when the ROAS dialog opens so we can show
  // the campaign metadata too.
  const { data: campaignDetail } = useApiQuery<any>(
    ["campaign-detail", String(campaign?.id ?? "")],
    campaign ? `/marketing/campaigns/${campaign.id}` : null,
    !!campaign,
  );

  if (!campaign) return null;

  const handleSaveRevenue = async () => {
    const n = Number(revenueInput);
    if (!Number.isFinite(n) || n < 0) {
      toast({ variant: "destructive", title: "أدخل قيمة إيرادات صحيحة" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/marketing/campaigns/${campaign.id}/revenue`, {
        method: "PATCH",
        body: JSON.stringify({ revenue: n }),
      });
      toast({ title: "تم تحديث الإيرادات" });
      qc.invalidateQueries({ queryKey: ["mkt-campaigns"] });
      qc.invalidateQueries({ queryKey: ["mkt-stats"] });
      refetch();
      setRevenueInput("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التحديث", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-status-info-foreground" />
            عائد الحملة: {campaign.name}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !roas ? (
          <p className="text-sm text-muted-foreground text-center py-4">جاري التحميل…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">المصروف</p>
                  <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(roas.spent)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">الإيرادات</p>
                  <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(roas.revenue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">عائد الإنفاق (ROAS)</p>
                  <p className={cn(
                    "text-lg font-bold",
                    roas.roas && Number(roas.roas) >= 3 ? "text-status-success-foreground"
                      : roas.roas && Number(roas.roas) >= 1 ? "text-status-warning-foreground"
                      : "text-status-error-foreground",
                  )}>
                    {roas.roas ? `${roas.roas}×` : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">العملاء المحتملون</p>
                  <p className="text-lg font-bold">{roas.leadsGenerated}</p>
                </CardContent>
              </Card>
            </div>
            {campaignDetail && (
              <div className="text-xs grid grid-cols-2 gap-1 border rounded p-2 bg-muted/30">
                {campaignDetail.channel && <p className="text-muted-foreground">القناة: <span className="font-medium">{campaignDetail.channel}</span></p>}
                {campaignDetail.status && <p className="text-muted-foreground">الحالة: <span className="font-medium">{campaignDetail.status}</span></p>}
                {campaignDetail.startDate && <p className="text-muted-foreground">البداية: <span className="font-medium">{campaignDetail.startDate}</span></p>}
                {campaignDetail.endDate && <p className="text-muted-foreground">النهاية: <span className="font-medium">{campaignDetail.endDate}</span></p>}
              </div>
            )}
            <div className="pt-3 border-t space-y-2">
              <Label className="text-xs">تحديث قيمة الإيرادات</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={String(roas.revenue || 0)}
                  value={revenueInput}
                  onChange={(e) => setRevenueInput(e.target.value)}
                  className="flex-1"
                />
                <GuardedButton
                  perm="marketing:update"
                  onClick={handleSaveRevenue}
                  disabled={saving || revenueInput === ""}
                  rateLimitAware
                >
                  حفظ
                </GuardedButton>
              </div>
              <p className="text-xs text-muted-foreground">
                ROAS = الإيرادات ÷ المصروف. تحديث الإيرادات سيعيد حساب القيمة فوراً.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STAGE_LABELS: Record<string, string> = {
  lead: "عميل محتمل",
  qualified: "مؤهل",
  proposal: "عرض",
  negotiation: "تفاوض",
  closed_won: "مغلق (ناجح)",
  closed_lost: "مغلق (خسارة)",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "الموقع الإلكتروني",
  referral: "إحالة",
  direct: "مباشر",
  campaign: "حملة تسويقية",
  social: "تواصل اجتماعي",
  other: "آخر",
};

function FunnelTab() {
  const { data: funnelResp, isLoading, isError, error, refetch } = useApiQuery<any>(["mkt-funnel"], "/marketing/funnel");
  const stages: any[] = funnelResp?.stages || [];
  const sourceFunnel: any[] = funnelResp?.sourceFunnel || [];
  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5 text-status-info-foreground" />قمع المبيعات (مسار علاقات العملاء)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 bg-surface-subtle rounded animate-pulse" />
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {stages.map((s: any, i: number) => {
                const maxCount = Math.max(...stages.map((x: any) => x.count), 1);
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.stage} className="text-center">
                    <div className="relative h-24 flex flex-col items-center justify-end mb-2">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <p className="text-sm font-semibold text-status-neutral-foreground">{s.count}</p>
                    <p className="text-xs text-muted-foreground">{STAGE_LABELS[s.stage] || s.stage}</p>
                    {s.conversionFromPrev && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">↑ {s.conversionFromPrev}%</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {sourceFunnel.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-purple-600" />تتبع مصادر العملاء</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              noToolbar
              pageSize={0}
              rowKey={(sf) => sf.source}
              data={sourceFunnel}
              columns={[
                { key: "source", header: "المصدر", className: "font-medium", render: (sf) => SOURCE_LABELS[sf.source] || sf.source },
                { key: "total", header: "إجمالي العملاء", render: (sf) => sf.total },
                { key: "won", header: "فرص ناجحة", className: "text-status-success-foreground", render: (sf) => sf.won },
                {
                  key: "rate",
                  header: "معدل التحويل",
                  render: (sf) => {
                    const rate = sf.total > 0 ? ((sf.won / sf.total) * 100).toFixed(1) : "0";
                    return (
                      <span className={cn("text-sm font-medium", Number(rate) >= 50 ? "text-status-success-foreground" : Number(rate) >= 25 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
                        {rate}%
                      </span>
                    );
                  },
                },
                { key: "wonValue", header: "إجمالي الإيرادات", render: (sf) => formatCurrency(Number(sf.wonValue) || 0) },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CampaignsTab() {
  const { data: stats } = useApiQuery<any>(["mkt-stats"], "/marketing/stats");
  const { data: campaignsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["mkt-campaigns"], "/marketing/campaigns");
  // GET /marketing/templates — reusable creative templates (subject + body
  // for email, body for SMS/WhatsApp). Exposed as a hint badge in the
  // header strip so users know how many are available.
  const { data: templatesResp } = useApiQuery<{ data: any[] }>(["mkt-templates"], "/marketing/templates");
  const templates = templatesResp?.data ?? [];
  const items = asList(campaignsResp);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const [previewCampaign, setPreviewCampaign] = useState<any>(null);
  const [roasCampaign, setRoasCampaign] = useState<any>(null);
  const campaignFields: PreviewField[] = [
    { label: "الحملة", key: "name" },
    { label: "القناة", key: "channel", type: "badge" },
    { label: "الميزانية", key: "budget", type: "currency" },
    { label: "المصروف", key: "spent", type: "currency" },
    { label: "الإيرادات", key: "revenue", type: "currency" },
    { label: "الوصف", key: "description" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const s = stats || {};

  // Marketing campaign lifecycle. Visual chip lives in PageStatusBadge.
  const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "draft",     label: "مسودة"  },
    { value: "active",    label: "نشط"    },
    { value: "paused",    label: "متوقف"  },
    { value: "completed", label: "مكتمل" },
  ];

  const filtered = applyFilters(items, filters, { searchFields: ["name", "channel"], statusField: "status", dateField: "createdAt" });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/marketing/campaigns",
    queryKeys: [["mkt-campaigns"], ["mkt-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الحملة" },
    { key: "channel", label: "القناة" },
    { key: "budget", label: "الميزانية", type: "number" as const },
    { key: "spent", label: "المصروف", type: "number" as const },
    { key: "revenue", label: "الإيرادات", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الحملة", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "channel", header: "القناة", sortable: true, render: (c) => <span className="text-muted-foreground">{c.channel || "-"}</span> },
    { key: "budget", header: "الميزانية", sortable: true, render: (c) => formatCurrency(Number(c.budget) || 0) },
    { key: "spent", header: "المصروف", sortable: true, render: (c) => formatCurrency(Number(c.spent) || 0) },
    {
      key: "roas",
      header: "عائد الإنفاق",
      render: (c) => {
        const spent = Number(c.spent) || 0;
        const revenue = Number(c.revenue) || 0;
        const roas = spent > 0 ? (revenue / spent).toFixed(2) : null;
        return (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer",
              roas == null && "text-muted-foreground",
              roas != null && Number(roas) >= 3 && "text-status-success-foreground",
              roas != null && Number(roas) >= 1 && Number(roas) < 3 && "text-status-warning-foreground",
              roas != null && Number(roas) < 1 && "text-status-error-foreground",
            )}
            onClick={() => setRoasCampaign(c)}
            title="عرض تفاصيل العائد + تحديث الإيرادات"
          >
            {roas ? `${roas}×` : "—"}
            <BarChart3 className="h-3 w-3 opacity-50" />
          </button>
        );
      },
    },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (c) => formatDateAr(c.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <PageStatusBadge status={c.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      align: "end",
      width: "100px",
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewCampaign(c)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(c.id, { name: c.name, channel: c.channel || "", budget: Number(c.budget) || 0, spent: Number(c.spent) || 0, revenue: Number(c.revenue) || 0, status: c.status || "draft" })}
            onDelete={() => startDelete(c.id)}
            deletePerm="marketing:delete"
          />
        </div>
      ),
    },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <KpiGrid items={[
        { label: "إجمالي الحملات", value: s.totalCampaigns || 0, icon: Megaphone, color: "text-pink-600 bg-pink-50" },
        { label: "نشطة", value: s.activeCampaigns || 0, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "مكتملة", value: s.completedCampaigns || 0, icon: Target, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "إجمالي العملاء المحتملين", value: s.totalLeads || 0, icon: Users, color: "text-purple-600 bg-purple-50" },
      ]} />

      {s.sourceCounts && s.sourceCounts.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-status-neutral-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4" />مصادر العملاء</p>
            <div className="flex flex-wrap gap-2">
              {s.sourceCounts.map((sc: any) => (
                <span key={sc.source} className="text-xs bg-status-info-surface text-status-info-foreground px-2 py-1 rounded-full">
                  {SOURCE_LABELS[sc.source] || sc.source}: {sc.count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الحملات التسويقية</h2>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {templates.length} قالب متاح
            </Badge>
          )}
          <PrintButton
            entityType="report_marketing_campaigns"
            entityId="list"
            size="icon"
            label="طباعة قائمة الحملات"
            payload={() => ({
              entity: { title: "قائمة الحملات التسويقية", total: printRows.length },
              items: printRows.map((c: any) => ({
                "الحملة": c.name || "—",
                "القناة": c.channel || "—",
                "الميزانية": Number(c.budget || 0),
                "المصروف": Number(c.spent || 0),
                "التاريخ": c.createdAt ? formatDateAr(c.createdAt) : "—",
                "الحالة": c.status || "—",
              })),
            })}
          />
          <Link href="/marketing/create">
            <GuardedButton perm="marketing:create" size="sm"><Plus className="h-4 w-4 me-1" />حملة جديدة</GuardedButton>
          </Link>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالحملة أو القناة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "name", label: "اسم الحملة" },
              { key: "channel", label: "القناة" },
              { key: "startDate", label: "تاريخ البدء" },
              { key: "endDate", label: "تاريخ الانتهاء" },
              { key: "budget", label: "الميزانية" },
              { key: "spent", label: "المصروف" },
              { key: "leads", label: "العملاء المحتملين" },
              { key: "conversions", label: "التحويلات" },
              { key: "roi", label: "العائد على الاستثمار" },
              { key: "status", label: "الحالة" },
            ],
            "حملات-التسويق",
          )
        }
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle>الحملات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد حملات"
            emptyIcon={<Megaphone className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            renderRowExtras={(c) => {
              if (editingId === c.id) {
                return <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(c.id, values)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === c.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.name} entityType="campaign" entityId={c.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewCampaign} onOpenChange={() => setPreviewCampaign(null)} title="تفاصيل الحملة" data={previewCampaign} fields={campaignFields} />
      <CampaignRoasDialog campaign={roasCampaign} onClose={() => setRoasCampaign(null)} />
    </div>
  );
}

export default function MarketingPage() {
  return (
    <PageShell title="التسويق والمبيعات"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "التسويق والمبيعات" },
      ]}>
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns"><Megaphone className="h-4 w-4 me-1.5" />الحملات</TabsTrigger>
          <TabsTrigger value="funnel"><BarChart2 className="h-4 w-4 me-1.5" />قمع المبيعات</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="funnel" className="mt-4">
          <FunnelTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
