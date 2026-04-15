import { useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Plus, DollarSign, Eye, TrendingUp, Users, BarChart2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

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
  const { data: funnelResp, isLoading } = useApiQuery<any>(["mkt-funnel"], "/marketing/funnel");
  const stages: any[] = funnelResp?.stages || [];
  const sourceFunnel: any[] = funnelResp?.sourceFunnel || [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5 text-blue-600" />قمع المبيعات (مسار علاقات العملاء)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 bg-gray-100 rounded animate-pulse" />
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
                    <p className="text-sm font-semibold text-gray-800">{s.count}</p>
                    <p className="text-xs text-gray-500">{STAGE_LABELS[s.stage] || s.stage}</p>
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
                { key: "won", header: "فرص ناجحة", className: "text-green-700", render: (sf) => sf.won },
                {
                  key: "rate",
                  header: "معدل التحويل",
                  render: (sf) => {
                    const rate = sf.total > 0 ? ((sf.won / sf.total) * 100).toFixed(1) : "0";
                    return (
                      <span className={cn("text-sm font-medium", Number(rate) >= 50 ? "text-green-600" : Number(rate) >= 25 ? "text-amber-600" : "text-red-600")}>
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
  const items = asList(campaignsResp);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const [previewCampaign, setPreviewCampaign] = useState<any>(null);
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
        return roas ? (
          <span className={cn("text-sm font-medium", Number(roas) >= 3 ? "text-green-600" : Number(roas) >= 1 ? "text-amber-600" : "text-red-600")}>
            {roas}×
          </span>
        ) : <span className="text-gray-400">—</span>;
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
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الحملات", value: s.totalCampaigns || 0, icon: Megaphone, color: "text-pink-600 bg-pink-50" },
          { label: "حملات نشطة", value: s.activeCampaigns || 0, icon: Megaphone, color: "text-green-600 bg-green-50" },
          { label: "الميزانية الكلية", value: formatCurrency(s.totalBudget || 0), icon: DollarSign, color: "text-blue-600 bg-blue-50" },
          { label: `عائد الإنفاق — ${s.roas ? `${s.roas}×` : "—"}`, value: formatCurrency(s.totalRevenue || 0), icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {s.sourceCounts && s.sourceCounts.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2"><Users className="h-4 w-4" />مصادر العملاء</p>
            <div className="flex flex-wrap gap-2">
              {s.sourceCounts.map((sc: any) => (
                <span key={sc.source} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                  {SOURCE_LABELS[sc.source] || sc.source}: {sc.count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الحملات التسويقية</h2>
        <Link href="/marketing/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />حملة جديدة</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالحملة أو القناة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle>الحملات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
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
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
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
    </div>
  );
}

export default function MarketingPage() {
  return (
    <PageShell title="التسويق والمبيعات">
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
