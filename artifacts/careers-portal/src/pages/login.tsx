import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, ArrowRight, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-bl from-[#1e3a5f] to-[#0a2e6e] relative overflow-hidden items-center justify-center p-12">
        <div className="geo-shape geo-shape-1" />
        <div className="geo-shape geo-shape-2" />
        <div className="geo-shape geo-shape-3" />
        <div className="geo-shape geo-shape-4" />

        <div className="relative z-10 text-center text-white">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/20">
            <Briefcase className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3">بوابة التوظيف</h2>
          <p className="text-blue-200 text-lg mb-6">مجموعة الدور</p>
          <div className="max-w-sm mx-auto space-y-3 text-sm text-blue-100/80">
            <p>تصفّح الوظائف المتاحة وقدّم طلبك بسهولة</p>
            <p>تابع حالة طلباتك في أي وقت</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">بوابة التوظيف</h1>
              <p className="text-sm text-muted-foreground">مجموعة الدور</p>
            </div>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-8">
              <h1 className="text-2xl font-bold mb-1">تسجيل الدخول</h1>
              <p className="text-sm text-muted-foreground mb-6">
                أدخل بياناتك للوصول لحسابك
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    dir="ltr"
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      dir="ltr"
                      className="h-11 pl-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-11" disabled={loading} rateLimitAware>
                  {loading ? "جاري الدخول..." : "تسجيل الدخول"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  ليس لديك حساب؟{" "}
                  <button
                    onClick={() => navigate("/register")}
                    className="text-primary font-medium hover:underline"
                  >
                    إنشاء حساب جديد
                  </button>
                </p>
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => navigate("/")}
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mx-auto"
                >
                  <ArrowRight className="w-4 h-4" />
                  تصفح الوظائف بدون حساب
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
