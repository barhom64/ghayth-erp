import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ClientSelect } from "@/components/shared/entity-selects";
import { Link2, Link2Off, User, ShieldCheck, Pencil } from "lucide-react";

/**
 * ClientPortalLinkCard — drops into any detail page (tenant, legal_case,
 * etc.) and shows whether that entity is linked to a CRM client account.
 * When linked, the linked client gets to see this entity through the
 * customer portal under the appropriate `availableSection`.
 *
 * Props:
 * - entityType: 'tenant' | 'legal_case' (matches the section name in /portal/me)
 * - entityId: numeric id of the tenant / legal_case
 * - patchPath: route to PATCH with { clientId } (e.g. `/properties/tenants/123`)
 * - linkedClientId: current clientId on the row (null when unlinked)
 * - linkedClientName: client name (joined by the detail endpoint) — optional
 * - perm: RBAC permission required to edit (matches the detail page's perm)
 * - onUpdated: callback to refetch the parent detail query
 */
export interface ClientPortalLinkCardProps {
  entityType: "tenant" | "legal_case";
  entityId: number | string;
  patchPath: string;
  linkedClientId: number | null;
  linkedClientName?: string | null;
  perm: string;
  onUpdated?: () => void;
}

const ENTITY_LABEL: Record<ClientPortalLinkCardProps["entityType"], { ar: string; section: string }> = {
  tenant: { ar: "المستأجر", section: "property" },
  legal_case: { ar: "القضية", section: "legal" },
};

export function ClientPortalLinkCard({
  entityType,
  entityId,
  patchPath,
  linkedClientId,
  linkedClientName,
  perm,
  onUpdated,
}: ClientPortalLinkCardProps) {
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>(linkedClientId ? String(linkedClientId) : "");
  const queryClient = useQueryClient();
  const meta = ENTITY_LABEL[entityType];

  // When already linked, fetch the client's portal-account status so the
  // operator knows whether the client can actually USE the link today.
  // Uses the existing /clients/:id/portal-account endpoint which returns
  // { account: PortalAccountRow | null }.
  const { data: portalResp } = useApiQuery<{ account: { isActive: boolean; lastLoginAt?: string | null } | null }>(
    ["client-portal-account", String(linkedClientId ?? "")],
    linkedClientId ? `/clients/${linkedClientId}/portal-account` : null,
  );
  const portalStatus = portalResp?.account
    ? { hasPortalAccount: portalResp.account.isActive, lastLoginAt: portalResp.account.lastLoginAt ?? null }
    : linkedClientId
      ? { hasPortalAccount: false, lastLoginAt: null }
      : undefined;

  const linkMut = useApiMutation<unknown, { clientId: number | null }>(
    () => patchPath,
    "PATCH",
    [],
    {
      successMessage: linkedClientId ? "تم تحديث الربط" : "تم ربط حساب العميل",
      onSuccess: () => {
        setOpen(false);
        // Invalidate the parent detail query + any list queries that
        // would render the link. Caller is expected to refetch via
        // onUpdated; this is a belt-and-suspenders pass.
        queryClient.invalidateQueries({ queryKey: [`${entityType}-detail`] });
        onUpdated?.();
      },
    },
  );

  const isLinked = linkedClientId != null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            ربط بحساب عميل (بوابة العملاء)
          </CardTitle>
          <GuardedButton
            perm={perm}
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedClientId(linkedClientId ? String(linkedClientId) : "");
              setOpen(true);
            }}
          >
            {isLinked ? <Pencil className="h-3.5 w-3.5 ml-1" /> : <Link2 className="h-3.5 w-3.5 ml-1" />}
            {isLinked ? "تعديل" : "ربط بعميل"}
          </GuardedButton>
        </CardHeader>
        <CardContent>
          {isLinked ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{linkedClientName ?? `العميل #${linkedClientId}`}</span>
                <Badge variant="outline" className="text-xs">قسم {meta.section} مفعّل</Badge>
              </div>
              {portalStatus && (
                portalStatus.hasPortalAccount ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-700">
                    <ShieldCheck className="h-3 w-3" />
                    حساب البوابة مفعّل
                    {portalStatus.lastLoginAt && (
                      <span className="text-muted-foreground">
                        — آخر دخول {new Date(portalStatus.lastLoginAt).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-amber-700">
                    العميل مربوط لكن لا يملك حساباً في البوابة بعد — افتح ملف العميل لإنشاء حساب
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              لا يوجد ربط — {meta.ar} لن يظهر في بوابة عميل، ولا أي عميل يستطيع الوصول لبياناته من البوابة.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {isLinked ? "تعديل ربط حساب العميل" : "ربط بحساب عميل"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              العميل المربوط سيرى بيانات {meta.ar} في بوابة العملاء تحت قسم
              <Badge variant="outline" className="mx-1">{meta.section}</Badge>
              — يشمل البيانات المالية والعقود والمستندات المرتبطة.
            </p>
            <div>
              <label className="text-sm font-medium">العميل</label>
              <ClientSelect
                value={selectedClientId}
                onChange={(v: string) => setSelectedClientId(v)}
                placeholder="ابحث عن عميل..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {isLinked && (
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                disabled={linkMut.isPending}
                onClick={() => linkMut.mutate({ clientId: null })}
              >
                <Link2Off className="h-4 w-4 ml-1" />
                إلغاء الربط
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button
              disabled={!selectedClientId || Number(selectedClientId) === linkedClientId || linkMut.isPending}
              onClick={() => selectedClientId && linkMut.mutate({ clientId: Number(selectedClientId) })}
            >
              {linkMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
