import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, AlertCircle, Truck } from "lucide-react";
import { driverFetch, setDriverSession, type DriverPortalDriver } from "./lib";

interface LoginResponse {
  token: string;
  mustChangePassword: boolean;
  driver: DriverPortalDriver;
}

export default function DriverPortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const resp = await driverFetch<LoginResponse>("/driver-portal/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
        noAuthRedirect: true,
      });
      setDriverSession(resp.token, resp.driver);
      navigate(resp.mustChangePassword ? "/driver-portal/profile?changePassword=1" : "/driver-portal/my-trips");
    } catch (err: any) {
      setError(err?.message || "فشل تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-status-info-surface flex items-center justify-center mb-2">
            <Truck className="h-6 w-6 text-status-info-foreground" />
          </div>
          <CardTitle className="text-xl">بوابة السائق</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">سجّل دخولك لمتابعة رحلاتك وإدارة حالتك</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="dp-email">البريد الإلكتروني</Label>
              <Input
                id="dp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="driver@example.com"
              />
            </div>
            <div>
              <Label htmlFor="dp-pass">كلمة المرور</Label>
              <Input
                id="dp-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" rateLimitAware className="w-full" disabled={submitting || !email || !password}>
              <LogIn className="h-4 w-4 me-2" />
              {submitting ? "جاري الدخول…" : "تسجيل الدخول"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              هل نسيت بياناتك؟ تواصل مع مدير الأسطول لإعادة التعيين.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
