/**
 * Pricing rules admin — wires the 6 pricing stubs introduced in PR #1377:
 *
 *   GET    /finance/pricing/rules         — list rules
 *   POST   /finance/pricing/rules         — create rule
 *   GET    /finance/pricing/rules/:id     — load rule for edit
 *   PUT    /finance/pricing/rules/:id     — update rule
 *   DELETE /finance/pricing/rules/:id     — soft-delete
 *   POST   /finance/pricing/resolve       — preview engine output
 *
 * The backend stubs are placeholders today — the page renders against the
 * documented response shape so a real implementation can swap in without
 * UI changes.
 */

import { useState } from "react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tag, Edit, Trash2, TestTube2 } from "lucide-react";

interface PricingRule {
  id: number;
  name: string;
  active: boolean;
  priority?: number;
  discount?: number;
  conditions?: any[];
}

export default function PricingRulesPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [showResolve, setShowResolve] = useState(false);

  const listQ = useApiQuery<{ data: PricingRule[] }>(
    ["pricing-rules"],
    "/finance/pricing/rules",
  );
  const rules: PricingRule[] = listQ.data?.data ?? [];

  const editingId = editing?.id ?? 0;
  const detailQ = useApiQuery<PricingRule>(
    ["pricing-rule", String(editingId)],
    editingId ? `/finance/pricing/rules/${editingId}` : null,
    !!editingId,
  );

  const createMut = useApiMutation<unknown, Partial<PricingRule>>(
    "/finance/pricing/rules",
    "POST",
    [["pricing-rules"]],
    { successMessage: "تم إنشاء قاعدة التسعير" },
  );
  const updateMut = useApiMutation<unknown, Partial<PricingRule> & { id: number }>(
    (b) => `/finance/pricing/rules/${b.id}`,
    "PUT",
    [["pricing-rules"]],
    { successMessage: "تم تحديث القاعدة" },
  );

  const [draft, setDraft] = useState<Partial<PricingRule>>({ name: "", active: true, discount: 0 });

  const handleSave = async () => {
    if (!draft.name) {
      toast({ variant: "destructive", title: "أدخل اسم القاعدة" });
      return;
    }
    // editing has id 0 for the "new rule" sentinel — distinguish create
    // vs update by the real id, not by truthiness of the wrapper object.
    if (editing && editing.id > 0) {
      await updateMut.mutateAsync({ id: editing.id, ...draft });
    } else {
      await createMut.mutateAsync(draft);
    }
    setEditing(null);
    setDraft({ name: "", active: true, discount: 0 });
    listQ.refetch();
  };

  // POST /finance/pricing/resolve — preview engine: pass productId+quantity,
  // get back applied rules and final price.
  const [resolveProductId, setResolveProductId] = useState("");
  const [resolveQty, setResolveQty] = useState("1");
  const [resolveOutput, setResolveOutput] = useState<any | null>(null);
  const handleResolve = async () => {
    if (!resolveProductId) return;
    try {
      const out = await apiFetch("/finance/pricing/resolve", {
        method: "POST",
        body: JSON.stringify({
          productId: Number(resolveProductId),
          quantity: Number(resolveQty || 1),
        }),
      });
      setResolveOutput(out);
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الحساب", description: err?.message });
    }
  };

  return (
    <PageShell
      title="قواعد التسعير"
      subtitle="إدارة قواعد الخصومات والترقيات الديناميكية"
      breadcrumbs={[{ label: "المالية" }, { label: "قواعد التسعير" }]}
      actions={
        <div className="flex gap-2">
          <GuardedButton perm="finance:update" size="sm" onClick={() => setShowResolve(true)}>
            <TestTube2 className="h-3.5 w-3.5 me-1" />
            معاينة القاعدة
          </GuardedButton>
          <GuardedButton
            perm="finance:update"
            size="sm"
            onClick={() => {
              setEditing({ id: 0 } as PricingRule);
              setDraft({ name: "", active: true, discount: 0 });
            }}
          >
            + إضافة قاعدة
          </GuardedButton>
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="h-4 w-4 text-status-info" />
            القواعد المعرّفة ({rules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? <LoadingSpinner /> : listQ.isError ? <ErrorState /> : (
            <DataTable
              data={rules}
              columns={[
                { key: "id", header: "#", render: (r) => <span className="font-mono text-[10px]">{r.id}</span> },
                { key: "name", header: "الاسم", render: (r) => <span className="font-medium">{r.name}</span> },
                { key: "active", header: "نشطة", render: (r) => (
                  <Badge variant={r.active ? "default" : "outline"}>{r.active ? "نعم" : "لا"}</Badge>
                )},
                { key: "discount", header: "الخصم", render: (r) => (
                  <span className="font-mono">{r.discount ? `${r.discount}%` : "—"}</span>
                )},
                { key: "actions", header: "إجراءات", render: (r) => (
                  <div className="flex gap-1">
                    <GuardedButton
                      perm="finance:update"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(r);
                        setDraft({ name: r.name, active: r.active, discount: r.discount ?? 0 });
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </GuardedButton>
                    <GuardedButton
                      perm="finance:delete"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting({ id: r.id, name: r.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-error" />
                    </GuardedButton>
                  </div>
                )},
              ] as DataTableColumn<PricingRule>[]}
              emptyMessage="لم يتم إنشاء قواعد بعد."
              pageSize={20}
            />
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل قاعدة" : "قاعدة جديدة"}</DialogTitle>
          </DialogHeader>
          {detailQ.isLoading && editing?.id ? <LoadingSpinner /> : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">اسم القاعدة</Label>
                <Input
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الخصم (%)</Label>
                  <Input
                    type="number"
                    value={String(draft.discount ?? 0)}
                    onChange={(e) => setDraft({ ...draft, discount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">الحالة</Label>
                  <select
                    value={draft.active ? "1" : "0"}
                    onChange={(e) => setDraft({ ...draft, active: e.target.value === "1" })}
                    className="w-full h-9 px-2 border rounded text-sm"
                  >
                    <option value="1">نشطة</option>
                    <option value="0">غير نشطة</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <GuardedButton
              perm="finance:update"
              rateLimitAware
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
            >
              حفظ
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={showResolve} onOpenChange={setShowResolve}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>معاينة محرك التسعير</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">رقم المنتج</Label>
                <Input
                  value={resolveProductId}
                  onChange={(e) => setResolveProductId(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">الكمية</Label>
                <Input
                  value={resolveQty}
                  onChange={(e) => setResolveQty(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <GuardedButton perm="finance:update" rateLimitAware onClick={handleResolve}>
              احتساب
            </GuardedButton>
            {resolveOutput && (
              <div className="border rounded p-3 text-xs space-y-1">
                <p className="text-muted-foreground">السعر الأساسي: <span className="font-mono">{formatCurrency(resolveOutput.basePrice)}</span></p>
                <p className="text-muted-foreground">الخصم: <span className="font-mono text-status-error-foreground">{formatCurrency(resolveOutput.discount)}</span></p>
                <p className="font-medium">السعر النهائي: <span className="font-mono">{formatCurrency(resolveOutput.finalPrice)}</span></p>
                <p className="text-muted-foreground">القواعد المطبقة: {resolveOutput.appliedRules?.length ?? 0}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {deleting && (
        <ConfirmDeleteDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          entity={{ type: "pricing-rule", id: deleting.id, name: deleting.name }}
          deletePath={`/finance/pricing/rules/${deleting.id}`}
          invalidateKeys={[["pricing-rules"]]}
          onDeleted={() => {
            setDeleting(null);
            listQ.refetch();
          }}
        />
      )}
    </PageShell>
  );
}
