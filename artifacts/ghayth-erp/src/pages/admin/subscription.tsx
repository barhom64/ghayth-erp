import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle, Clock } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

export default function AdminSubscriptionPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["admin-subscription"], "/admin/subscription");
  const sub = data?.data || data || {};

  const [activateForm, setActivateForm] = useState({ planId: "", expiresAt: "" });
  const [extendDays, setExtendDays] = useState("");
  const [showActivate, setShowActivate] = useState(false);
  const [showExtend, setShowExtend] = useState(false);

  const activate = async () => {
    try {
      await apiFetch("/admin/subscription/activate", {
        method: "POST",
        body: JSON.stringify({
          planId: activateForm.planId || undefined,
          expiresAt: activateForm.expiresAt || undefined,
        }),
      });
      toast({ title: "تم تفعيل الاشتراك" });
      setShowActivate(false);
      refetch();
    } catch (err: any) {
      toast({ title: "فشل التفعيل", description: err?.message, variant: "destructive" });
    }
  };

  const extendTrial = async () => {
    try {
      await apiFetch("/admin/subscription/extend-trial", {
        method: "POST",
        body: JSON.stringify({ days: extendDays ? Number(extendDays) : undefined }),
      });
      toast({ title: "تم تمديد التجربة" });
      setShowExtend(false);
      refetch();
    } catch (err: any) {
      toast({ title: "فشل التمديد", description: err?.message, variant: "destructive" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const isActive = sub.status === "active";
  const isTrial = sub.status === "trial";

  return (
    <PageShell
      title="الاشتراك"
      breadcrumbs={[{ href: "/admin", label: "الإدارة" }, { label: "الاشتراك" }]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              حالة الاشتراك
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">الحالة:</span>
              <Badge className={isActive ? "bg-status-success-surface text-status-success-foreground" : isTrial ? "bg-status-warning-surface text-status-warning-foreground" : ""}>
                {sub.status === "active" ? "نشط" : sub.status === "trial" ? "تجريبي" : sub.status || "—"}
              </Badge>
            </div>
            {sub.planId && <div><span className="text-muted-foreground">الباقة: </span>{sub.planId}</div>}
            {sub.expiresAt && <div><span className="text-muted-foreground">تنتهي: </span>{formatDateAr(sub.expiresAt)}</div>}
            {sub.trialEndsAt && <div><span className="text-muted-foreground">نهاية التجربة: </span>{formatDateAr(sub.trialEndsAt)}</div>}
            {sub.companyName && <div><span className="text-muted-foreground">الشركة: </span>{sub.companyName}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">الإجراءات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <GuardedButton perm="admin:update" variant="outline" className="w-full justify-start"
              onClick={() => { setShowActivate((v) => !v); setShowExtend(false); }}>
              <CheckCircle className="h-4 w-4 me-2" />تفعيل الاشتراك
            </GuardedButton>
            <GuardedButton perm="admin:update" variant="outline" className="w-full justify-start"
              onClick={() => { setShowExtend((v) => !v); setShowActivate(false); }}>
              <Clock className="h-4 w-4 me-2" />تمديد الفترة التجريبية
            </GuardedButton>
          </CardContent>
        </Card>
      </div>

      {showActivate && (
        <Card className="mt-4">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">تفعيل الاشتراك</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>معرّف الباقة</Label>
                <Input value={activateForm.planId} onChange={(e) => setActivateForm((f) => ({ ...f, planId: e.target.value }))} />
              </div>
              <div>
                <Label>تاريخ الانتهاء</Label>
                <Input type="date" value={activateForm.expiresAt} onChange={(e) => setActivateForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={activate}>تفعيل</Button>
              <Button variant="outline" onClick={() => setShowActivate(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showExtend && (
        <Card className="mt-4">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">تمديد الفترة التجريبية</h4>
            <div>
              <Label>عدد الأيام</Label>
              <Input type="number" className="max-w-xs" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={extendTrial}>تمديد</Button>
              <Button variant="outline" onClick={() => setShowExtend(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
