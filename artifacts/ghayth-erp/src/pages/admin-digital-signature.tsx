/**
 * Digital signature OTP probe — the digital-signature module exposes
 * three endpoints used by the document-signing flow:
 *   POST /digital-signature/request-otp  — generate an OTP for a sign action
 *   POST /digital-signature/verify       — verify the OTP and finalize the signature
 *   GET  /digital-signature/logs         — audit log of all sign attempts
 *
 * Most consumers call these via the document-detail flow. This admin
 * page exposes them directly so the document-signing flow can be
 * tested in isolation and the compliance team can browse the signing
 * audit log without leaving the admin area.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Shield, Key, CheckCircle2, FileSearch } from "lucide-react";

export default function AdminDigitalSignaturePage() {
  const { toast } = useToast();

  const [entityType, setEntityType] = useState("document");
  const [entityId, setEntityId] = useState("");
  const [action, setAction] = useState("sign");
  const [otpCode, setOtpCode] = useState("");
  // In production the server delivers the OTP out-of-band (SMS/email)
  // and the response only confirms dispatch. The dev-mode probe also
  // echoes the OTP in `res.otp` — handy for testing without a live
  // delivery channel.
  const [lastOtpPreview, setLastOtpPreview] = useState<string>("");

  const handleRequestOtp = async () => {
    const id = Number(entityId);
    if (!Number.isFinite(id) || id <= 0) {
      toast({ variant: "destructive", title: "حدد رقم الكيان" });
      return;
    }
    try {
      const res: any = await apiFetch("/digital-signature/request-otp", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId: id, action }),
      });
      setLastOtpPreview(typeof res?.otp === "string" ? res.otp : "");
      toast({
        title: "أُرسلت كلمة المرور لمرة واحدة",
        description: res?.expiresAt ? `صالحة حتى ${new Date(res.expiresAt).toLocaleString("ar-SA")}` : "",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الإرسال", description: err?.message });
    }
  };

  const handleVerify = async () => {
    if (!otpCode.trim()) {
      toast({ variant: "destructive", title: "أدخل كلمة المرور" });
      return;
    }
    const id = Number(entityId);
    if (!Number.isFinite(id) || id <= 0) {
      toast({ variant: "destructive", title: "حدد رقم الكيان" });
      return;
    }
    try {
      const res: any = await apiFetch("/digital-signature/verify", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId: id, action, otp: otpCode.trim() }),
      });
      toast({
        title: "تم التحقق",
        description: res?.signatureRef ? `مرجع التوقيع: ${res.signatureRef}` : "",
      });
      setOtpCode("");
      logsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التحقق", description: err?.message });
    }
  };

  const logsQ = useApiQuery<{ data: any[] }>(["digital-signature-logs"], "/digital-signature/logs?limit=50");
  const logs: any[] = logsQ.data?.data ?? [];

  return (
    <PageShell
      title="فاحص التوقيع الرقمي"
      subtitle="تجربة دورة OTP الكاملة (إصدار، تحقق، سجل) من الواجهة الإدارية مباشرة"
      breadcrumbs={[{ label: "الإدارة" }, { label: "التوقيع الرقمي" }]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-status-info" />
              إصدار OTP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">نوع الكيان</label>
                <input value={entityType} onChange={(e) => setEntityType(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">رقم الكيان</label>
                <input value={entityId} onChange={(e) => setEntityId(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground">الإجراء</label>
                <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full h-8 px-2 border rounded bg-white">
                  <option value="sign">توقيع</option>
                  <option value="approve">اعتماد</option>
                  <option value="release">إفراج</option>
                </select>
              </div>
            </div>
            <GuardedButton perm="documents:create" size="sm" rateLimitAware onClick={handleRequestOtp}>
              إصدار OTP
            </GuardedButton>
            {lastOtpPreview && (
              <p className="text-[10px] text-muted-foreground">
                OTP المطوّر: <span className="font-mono">{lastOtpPreview}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-status-success" />
              تحقق من OTP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div>
              <label className="text-[10px] text-muted-foreground">كلمة المرور المؤقتة</label>
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                dir="ltr"
                className="w-full h-8 px-2 border rounded font-mono"
                placeholder="6 أرقام"
              />
            </div>
            <GuardedButton perm="documents:create" size="sm" rateLimitAware onClick={handleVerify}>
              تحقق وأكمل التوقيع
            </GuardedButton>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-status-info" />
              سجل التوقيعات ({logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logsQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs max-h-72 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">لا توجد محاولات مسجلة</p>
                ) : (
                  logs.slice(0, 50).map((l: any, i: number) => (
                    <div key={l.id ?? i} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-[10px]">
                          {l.entityType ?? "—"} #{l.entityId ?? "?"}
                          {" · "}{l.action ?? "—"}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          IP: {l.ipAddress ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{l.status ?? "—"}</Badge>
                        <span className="text-muted-foreground text-[10px]">
                          {l.createdAt ? formatDateAr(l.createdAt) : ""}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
