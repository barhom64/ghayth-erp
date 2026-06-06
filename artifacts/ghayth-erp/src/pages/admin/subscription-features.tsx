// Admin → Subscription features (P4.6 of the workflow plan).
//
// Per-feature entitlement editor. Owner / admin sees the full feature
// catalog left-joined with the company's status row, and can flip each
// feature active/cancelled/expired, set an expiry date, or add a
// note. Backed by GET/POST/DELETE /admin/subscription-features/*.
//
// Mounts under /admin (level 90 + module=admin). Defaults to the
// current company's id from useAuth; an optional companyId query
// parameter lets a cross-tenant admin target another tenant.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { formatDateAr } from "@/lib/formatters";
import { CheckCircle2, XCircle, AlertOctagon, Clock, Package } from "lucide-react";

type FeatureStatus = "active" | "trial" | "expired" | "cancelled";

interface MatrixRow {
  featureKey: string;
  productKey: string;
  labelAr: string;
  isCoreToProduct: boolean;
  status: FeatureStatus | null;
  enabledAt: string | null;
  expiresAt: string | null;
}

interface EditDraft {
  row: MatrixRow;
  status: FeatureStatus;
  expiresAt: string;
  notes: string;
}

const STATUS_LABEL: Record<FeatureStatus, string> = {
  active: "مفعّلة",
  trial: "تجريبية",
  expired: "منتهية",
  cancelled: "ملغاة",
};

const STATUS_BADGE_VARIANT: Record<FeatureStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trial: "secondary",
  expired: "outline",
  cancelled: "destructive",
};

export default function AdminSubscriptionFeatures() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // companyId from the URL query overrides scope.companyId (cross-tenant
  // admin use). Falls back to the current user's company.
  const overrideCompanyId = useMemo(() => {
    const qs = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const raw = params.get("companyId");
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  }, [location]);

  const companyId = overrideCompanyId ?? user?.companyId ?? null;

  const [productFilter, setProductFilter] = useState<string>("all");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const matrixQuery = useApiQuery<{ companyId: number; data: MatrixRow[] }>(
    ["admin-subscription-features", String(companyId ?? "")],
    companyId ? `/admin/subscription-features/companies/${companyId}/features` : null,
    { enabled: !!companyId },
  );

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const r of matrixQuery.data?.data ?? []) set.add(r.productKey);
    return Array.from(set).sort();
  }, [matrixQuery.data]);

  const visibleRows = useMemo(() => {
    const rows = matrixQuery.data?.data ?? [];
    return productFilter === "all" ? rows : rows.filter((r) => r.productKey === productFilter);
  }, [matrixQuery.data, productFilter]);

  async function saveDraft() {
    if (!editDraft || !companyId) return;
    try {
      const body: Record<string, unknown> = {
        status: editDraft.status,
        notes: editDraft.notes || undefined,
      };
      if (editDraft.expiresAt) {
        body.expiresAt = new Date(editDraft.expiresAt).toISOString();
      } else {
        body.expiresAt = null;
      }
      await apiFetch(
        `/admin/subscription-features/companies/${companyId}/features/${encodeURIComponent(editDraft.row.featureKey)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      toast({ title: "تم التحديث", description: `${editDraft.row.labelAr} → ${STATUS_LABEL[editDraft.status]}` });
      await qc.invalidateQueries({ queryKey: ["admin-subscription-features", String(companyId ?? "")] });
      setEditDraft(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "فشل التحديث",
        description: err?.message ?? "حاول مرة أخرى",
      });
    }
  }

  async function cancelFeature(row: MatrixRow) {
    if (!companyId) return;
    try {
      await apiFetch(
        `/admin/subscription-features/companies/${companyId}/features/${encodeURIComponent(row.featureKey)}`,
        { method: "DELETE" },
      );
      toast({ title: "تم الإلغاء", description: row.labelAr });
      await qc.invalidateQueries({ queryKey: ["admin-subscription-features", String(companyId ?? "")] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "فشل الإلغاء",
        description: err?.message ?? "حاول مرة أخرى",
      });
    }
  }

  const columns: DataTableColumn<MatrixRow>[] = [
    {
      key: "productKey",
      header: "المنتج",
      render: (row) => (
        <Badge variant="outline" className="font-mono text-[10px]">
          {row.productKey}
        </Badge>
      ),
    },
    {
      key: "labelAr",
      header: "الميزة",
      render: (row) => (
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{row.labelAr}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{row.featureKey}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (row) => {
        if (!row.status) {
          return <Badge variant="outline" className="text-[10px]">غير مُفعّلة</Badge>;
        }
        return (
          <Badge variant={STATUS_BADGE_VARIANT[row.status]} className="text-[10px]">
            {STATUS_LABEL[row.status]}
          </Badge>
        );
      },
    },
    {
      key: "expiresAt",
      header: "ينتهي في",
      render: (row) =>
        row.expiresAt ? (
          <span className="text-xs">{formatDateAr(row.expiresAt)}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              setEditDraft({
                row,
                status: row.status ?? "active",
                expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : "",
                notes: "",
              })
            }
          >
            تعديل
          </Button>
          {row.status && row.status !== "cancelled" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-status-error-foreground"
              onClick={() => cancelFeature(row)}
            >
              إلغاء
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Aggregate counters for the stat tiles.
  const counters = useMemo(() => {
    const rows = matrixQuery.data?.data ?? [];
    let active = 0, trial = 0, expired = 0, cancelled = 0, notProvisioned = 0;
    for (const r of rows) {
      if (!r.status) { notProvisioned++; continue; }
      if (r.status === "active") active++;
      else if (r.status === "trial") trial++;
      else if (r.status === "expired") expired++;
      else if (r.status === "cancelled") cancelled++;
    }
    return { active, trial, expired, cancelled, notProvisioned };
  }, [matrixQuery.data]);

  return (
    <PageShell
      title="إدارة اشتراك الميزات"
      subtitle="مصفوفة المنتجات × الميزات لكل شركة + تعديل الحالة والصلاحية"
    >
      <PageStateWrapper isLoading={matrixQuery.isLoading} error={matrixQuery.error}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatCard label="مفعّلة" value={counters.active} icon={CheckCircle2} tone="success" />
          <StatCard label="تجريبية" value={counters.trial} icon={Clock} tone="info" />
          <StatCard label="منتهية" value={counters.expired} icon={AlertOctagon} tone="warning" />
          <StatCard label="ملغاة" value={counters.cancelled} icon={XCircle} tone="error" />
          <StatCard label="غير مُفعّلة" value={counters.notProvisioned} icon={Package} tone="muted" />
        </div>

        <Card className="mb-3">
          <CardContent className="p-3 grid gap-2 sm:grid-cols-3">
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger><SelectValue placeholder="كل المنتجات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنتجات</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="sm:col-span-2 text-xs text-muted-foreground flex items-center">
              {companyId ? `الشركة #${companyId} — ${visibleRows.length} ميزة` : "لا يمكن تحديد الشركة"}
            </div>
          </CardContent>
        </Card>

        <DataTable
          data={visibleRows}
          columns={columns}
          rowKey={(row) => row.featureKey}
          noToolbar
        />
      </PageStateWrapper>

      <Dialog open={!!editDraft} onOpenChange={(o) => !o && setEditDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل اشتراك الميزة</DialogTitle>
            <DialogDescription className="text-xs">
              {editDraft?.row.labelAr} —{" "}
              <span className="font-mono">{editDraft?.row.featureKey}</span>
            </DialogDescription>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">الحالة</label>
                <Select
                  value={editDraft.status}
                  onValueChange={(v) => setEditDraft({ ...editDraft, status: v as FeatureStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">مفعّلة</SelectItem>
                    <SelectItem value="trial">تجريبية</SelectItem>
                    <SelectItem value="expired">منتهية</SelectItem>
                    <SelectItem value="cancelled">ملغاة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">ينتهي في (اختياري)</label>
                <Input
                  type="date"
                  value={editDraft.expiresAt}
                  onChange={(e) => setEditDraft({ ...editDraft, expiresAt: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">ملاحظات</label>
                <Textarea
                  rows={3}
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                  placeholder="مثلاً: تجديد العقد بعد دفع الرسوم"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDraft(null)}>إلغاء</Button>
            <Button onClick={saveDraft}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "info" | "warning" | "error" | "success" | "muted";
}) {
  const toneClass: Record<typeof tone, string> = {
    info: "bg-status-info-surface text-status-info-foreground",
    warning: "bg-status-warning-surface text-status-warning-foreground",
    error: "bg-status-error-surface text-status-error-foreground",
    success: "bg-status-success-surface text-status-success-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className={toneClass[tone]}>
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] opacity-70">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
        </div>
        <Icon className="h-6 w-6 opacity-60" />
      </CardContent>
    </Card>
  );
}
