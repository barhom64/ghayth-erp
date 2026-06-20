import { useState } from "react";
import { apiFetch, useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Copy, KeyRound } from "lucide-react";

// #2712 الدفعة 1أ — قسم المصادقة الثنائية (TOTP) في «مساحتي».
// التسجيل فقط: إعداد (QR) ← تفعيل (تأكيد رمز) ← رموز احتياطية، أو تعطيل.
// الإنفاذ عند تسجيل الدخول دفعة لاحقة (1ب) — هذا القسم لا يغيّر الدخول.

type Status = { enabled: boolean; enrolledAt: string | null; backupCodesRemaining: number };
type SetupData = { secret: string; otpauthUrl: string; qrDataUrl: string };

export function TwoFactorSection() {
  const { toast } = useToast();
  const { data: status, isLoading, refetch } = useApiQuery<Status>(["2fa-status"], "/auth/2fa/status");
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [pw, setPw] = useState("");
  const [disableCode, setDisableCode] = useState("");

  async function startSetup() {
    setBusy(true);
    try {
      const data = await apiFetch<SetupData>("/auth/2fa/setup", { method: "POST" });
      setSetup(data);
      setCode("");
      setBackupCodes(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "تعذّر بدء الإعداد" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ backupCodes: string[] }>("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ token: code.trim() }),
      });
      setBackupCodes(res.backupCodes || []);
      setSetup(null);
      setCode("");
      toast({ title: "تم تفعيل المصادقة الثنائية" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "رمز التحقق غير صحيح" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!pw) return;
    setBusy(true);
    try {
      await apiFetch("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ password: pw, token: disableCode.trim() || undefined }),
      });
      toast({ title: "تم تعطيل المصادقة الثنائية" });
      setDisabling(false);
      setPw("");
      setDisableCode("");
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "تعذّر التعطيل" });
    } finally {
      setBusy(false);
    }
  }

  function copyBackup() {
    if (backupCodes && navigator.clipboard) {
      navigator.clipboard.writeText(backupCodes.join("\n"));
      toast({ title: "تم نسخ الرموز الاحتياطية" });
    }
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          المصادقة الثنائية (2FA)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : backupCodes ? (
          // عرض الرموز الاحتياطية مرة واحدة بعد التفعيل
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-status-success-surface text-status-success-foreground">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">تم تفعيل المصادقة الثنائية. احفظ هذه الرموز الاحتياطية — لن تظهر مرة أخرى.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm p-3 rounded-xl bg-muted" dir="ltr">
              {backupCodes.map((c) => (
                <span key={c} className="tracking-wider">{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyBackup}>
                <Copy className="w-4 h-4 ms-1" /> نسخ الرموز
              </Button>
              <Button size="sm" onClick={() => setBackupCodes(null)}>تم الحفظ</Button>
            </div>
          </div>
        ) : status?.enabled ? (
          // مفعّلة — عرض الحالة + تعطيل
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="font-medium text-emerald-600">مفعّلة</span>
              <span className="text-muted-foreground">· الرموز الاحتياطية المتبقية: {status.backupCodesRemaining}</span>
            </div>
            {disabling ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">كلمة المرور</Label>
                  <Input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">رمز التحقق الحالي (من التطبيق)</Label>
                  <Input dir="ltr" inputMode="numeric" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={busy || !pw} onClick={confirmDisable}>
                    {busy ? "جاري التعطيل…" : "تأكيد التعطيل"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setDisabling(false); setPw(""); setDisableCode(""); }}>إلغاء</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setDisabling(true)}>
                <ShieldAlert className="w-4 h-4 ms-1" /> تعطيل المصادقة الثنائية
              </Button>
            )}
          </div>
        ) : setup ? (
          // إعداد — عرض QR + السرّ + إدخال الرمز للتأكيد
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              امسح رمز QR بتطبيق مصادقة (Google Authenticator / Authy / Microsoft Authenticator)، ثم أدخل الرمز المكوّن من 6 أرقام لتأكيد التفعيل.
            </p>
            <div className="flex flex-col items-center gap-2">
              <img src={setup.qrDataUrl} alt="رمز QR للمصادقة الثنائية" className="w-44 h-44 rounded-lg border" />
              <div className="text-xs text-muted-foreground">أو أدخل السرّ يدويًا:</div>
              <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all" dir="ltr">{setup.secret}</code>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">رمز التحقق</Label>
              <Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || code.trim().length < 6} onClick={confirmEnable}>
                {busy ? "جاري التفعيل…" : "تأكيد التفعيل"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>إلغاء</Button>
            </div>
          </div>
        ) : (
          // غير مفعّلة — مقدمة + زر التفعيل
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              طبقة حماية إضافية: بعد كلمة المرور، يُطلب رمز مؤقّت من تطبيق المصادقة على هاتفك.
            </p>
            <Button size="sm" disabled={busy} onClick={startSetup}>
              <KeyRound className="w-4 h-4 ms-1" /> {busy ? "جاري…" : "تفعيل المصادقة الثنائية"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
