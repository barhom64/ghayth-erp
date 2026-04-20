import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import {
  Users2, Users, Plus, Eye, Phone, Mail, ChevronDown, ChevronUp, UserCheck, UserX, UserPlus
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { PageShell } from "@/components/page-shell";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";

export default function PropertiesTenants() {
  const { scopeQueryString } = useAppContext();

  const { data: tenantsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-tenants-list", scopeQueryString],
    `/properties/tenants/list?${scopeQueryString || ""}`
  );
  const tenants = asList(tenantsResp);

  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<any>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  if (isLoading) return <PageShell title="المستأجرون" breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "المستأجرون" }]}><LoadingSpinner /></PageShell>;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filtered = applyFilters(tenants, filters, {
    searchFields: ["name", "phone", "email", "nationalId"] as any,
  });

  const rowKeyOf = (t: any) => t.id ?? t.name;

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0">
            {(t.name || "?")[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{t.name}</p>
            {t.email && <p className="text-xs text-gray-400">{t.email}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      sortable: true,
      render: (t) =>
        t.phone ? (
          <a href={`tel:${t.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <Phone className="h-3 w-3" /> {t.phone}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "nationalId",
      header: "رقم الهوية",
      sortable: true,
      className: "font-mono text-sm",
      render: (t) => t.nationalId || "—",
    },
    {
      key: "activeContracts",
      header: "العقود",
      sortable: true,
      render: (t) => (
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold">{t.totalContracts || 0}</span>
          {t.activeContracts > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1">
              {t.activeContracts} نشط
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "currentUnit",
      header: "الوحدة الحالية",
      sortable: true,
      className: "text-sm",
      render: (t) => t.currentUnit || "—",
    },
    {
      key: "totalPaid",
      header: "إجمالي المدفوعات",
      sortable: true,
      className: "font-bold text-emerald-600 text-sm",
      render: (t) => formatCurrency(t.totalPaid || 0),
    },
    {
      key: "actions",
      header: "الإجراءات",
      render: (t) => {
        const key = rowKeyOf(t);
        return (
          <div className="flex items-center gap-1">
            <Link href={`/properties/tenants/${typeof t.id === "string" && t.id.startsWith("c-") ? encodeURIComponent(t.name) : t.id}`}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                <Eye className="h-3 w-3" /> ملف
              </Button>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedId(expandedId === key ? null : key);
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              {expandedId === key ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell
      title="المستأجرون"
      subtitle="سجل كامل لجميع المستأجرين الحاليين والسابقين"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "المستأجرون" }]}
      actions={
        <Link href="/properties/tenants/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مستأجر جديد</Button>
        </Link>
      }
    >
      <PropertyTabsNav />
      <KpiGrid items={[
        { label: "إجمالي المستأجرين", value: tenants.length, icon: Users, color: "text-blue-600 bg-blue-50" },
        { label: "نشط", value: tenants.filter((t: any) => t.activeContracts > 0).length, icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
        { label: "عقود منتهية", value: tenants.filter((t: any) => !t.activeContracts || t.activeContracts === 0).length, icon: UserX, color: "text-red-600 bg-red-50" },
        { label: "جديد هذا الشهر", value: tenants.filter((t: any) => { const d = new Date(t.createdAt); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length, icon: UserPlus, color: "text-purple-600 bg-purple-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الهاتف أو رقم الهوية...",
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "email", label: "البريد" },
          { key: "nationalId", label: "رقم الهوية" },
          { key: "activeContracts", label: "العقود النشطة" },
        ], "المستأجرون")}
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="tenant"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["property-tenants-list"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "email", label: "البريد" },
          { key: "nationalId", label: "رقم الهوية" },
          { key: "activeContracts", label: "العقود النشطة" },
        ]}
        csvFileName="المستأجرون"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-violet-500" /> قائمة المستأجرين
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={refetch}
            noToolbar
            rowKey={rowKeyOf}
            emptyMessage="لا يوجد مستأجرون"
            emptyIcon={<Users2 className="h-6 w-6 text-slate-400" />}
            pageSize={25}
            renderRowExtras={(t) => {
              const key = rowKeyOf(t);
              if (expandedId !== key) return null;
              return (
                <div className="bg-violet-50/30">
                  <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">معلومات التواصل</p>
                      {t.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {t.phone}</p>}
                      {t.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {t.email}</p>}
                      {t.nationality && <p className="text-xs text-gray-500">الجنسية: {t.nationality}</p>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">العقود</p>
                      {t.contracts?.slice(0, 3).map((c: any, i: number) => (
                        <p key={i} className="text-xs text-gray-600">
                          {c.unitNumber} — {formatDateAr(c.startDate)} ← {formatDateAr(c.endDate)}
                          <PageStatusBadge status={c.status} />
                        </p>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">المالي</p>
                      <p className="text-xs">إجمالي المدفوعات: <span className="font-bold text-emerald-600">{formatCurrency(t.totalPaid || 0)}</span></p>
                      <p className="text-xs">المتأخرات: <span className="font-bold text-red-600">{formatCurrency(t.overdueAmount || 0)}</span></p>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
