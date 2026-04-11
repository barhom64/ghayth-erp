import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const [, navigate] = useLocation();

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (form.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      await register(form.name, form.email, form.phone, form.password);
      navigate("/profile");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "تقديم على الوظائف المتاحة بسهولة",
    "متابعة حالة طلباتك",
    "إدارة ملفك الشخصي والسيرة الذاتية",
  ];

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-bl from-[#1e3a5f] to-[#0a2e6e] relative overflow-hidden items-center justify-center p-12">
        <div className="geo-shape geo-shape-1" />
        <div className="geo-shape geo-shape-2" />
        <div className="geo-shape geo-shape-3" />
        <div className="geo-shape geo-shape-4" />

        <div className="relative z-10 text-white">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/20">
            <Briefcase className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3 text-center">انضم إلينا</h2>
          <p className="text-blue-200 text-lg mb-8 text-center">مجموعة الدور</p>
          <div className="space-y-4 max-w-sm mx-auto">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-blue-100/90">
                <CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" />
                <span className="text-sm">{f}</span>
              </div>
            ))}
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
              <h1 className="text-2xl font-bold mb-1">إنشاء حساب جديد</h1>
              <p className="text-sm text-muted-foreground mb-6">
                سجّل حسابك للتقديم على الوظائف المتاحة
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">الاسم الكامل</Label>
                  <Input
                    id="name"
                    placeholder="أحمد محمد"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    required
                    dir="ltr"
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">رقم الجوال</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="05xxxxxxxx"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
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
                      placeholder="6 أحرف على الأقل"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                  <Input
                    id="confirm"
                    type={showPass ? "text" : "password"}
                    placeholder="أعد كتابة كلمة المرور"
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    required
                    dir="ltr"
                    className="h-11"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  لديك حساب بالفعل؟{" "}
                  <button
                    onClick={() => navigate("/login")}
                    className="text-primary font-medium hover:underline"
                  >
                    تسجيل الدخول
                  </button>
                </p>
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => navigate("/")}
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mx-auto"
                >
                  <ArrowRight className="w-4 h-4" />
                  تصفح الوظائف
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
