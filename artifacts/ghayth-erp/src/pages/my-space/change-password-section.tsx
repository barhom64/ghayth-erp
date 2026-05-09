import { useState } from "react";
import { apiFetch, isRateLimitedError } from "@/lib/api";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";

export function ChangePasswordSection() {
  const { toast } = useToast();
  const cooldown = useRateLimitCooldown();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!current || !newPw) { toast({ variant: "destructive", title: "يرجى ملء جميع الحقول" }); return; }
    if (newPw.length < 6) { toast({ variant: "destructive", title: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" }); return; }
    if (newPw !== confirmPw) { toast({ variant: "destructive", title: "كلمة المرور الجديدة وتأكيدها غير متطابقتين" }); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setCurrent(""); setNewPw(""); setConfirmPw("");
      setSuccess(true);
    } catch (e: any) {
      // The shared apiFetch already shows a debounced rate-limit toast on
      // 429, so swallow it here to avoid a duplicate generic error toast.
      if (isRateLimitedError(e)) { setLoading(false); return; }
      toast({ variant: "destructive", title: e.message || "فشل في تغيير كلمة المرور" });
    }
    setLoading(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-purple-500" />
          تغيير كلمة المرور
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {success ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 text-green-700">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">تم تغيير كلمة المرور بنجاح</p>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSuccess(false)}>تغيير مجدداً</Button>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">كلمة المرور الحالية</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  dir="ltr"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
                <button className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setShowCurrent(!showCurrent)}>
                  {showCurrent ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  dir="ltr"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <button className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setShowNew(!showNew)}>
                  {showNew ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">تأكيد كلمة المرور الجديدة</Label>
              <Input
                type="password"
                dir="ltr"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={loading || cooldown.isCoolingDown || !current || !newPw || !confirmPw}
              rateLimitAware
            >
              {loading
                ? "جاري التغيير..."
                : cooldown.isCoolingDown
                  ? cooldown.label
                  : "تغيير كلمة المرور"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
