import { useState, useEffect } from "react";
import "@/styles/login.css";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, CloudRain, User, Lock, AlertCircle, Eye, EyeOff,
  KeyRound, ArrowRight, ShieldCheck, Layers, BarChart3,
  Trophy, Newspaper, Mail, CheckCircle2, Clock
} from "lucide-react";

type ViewType = "login" | "forgot";

interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  publishedAt: string;
}

interface EmployeeOfMonth {
  id: number;
  month: number;
  year: number;
  reason: string;
  employeeName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  branchName: string | null;
}

const MONTH_NAMES = [
  "", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [employeeOfMonth, setEmployeeOfMonth] = useState<EmployeeOfMonth | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/dashboard";
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetch(`${BASE}/api/public/announcements`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setAnnouncements(d.data || []))
      .catch(() => {});

    fetch(`${BASE}/api/public/employee-of-month`)
      .then(r => r.ok ? r.json() : { data: null })
      .then(d => setEmployeeOfMonth(d.data || null))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (!email || !password) {
      setLoginError("الرجاء إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.refreshToken) {
        localStorage.setItem("erp_refresh_token", data.refreshToken);
      }
      login(data.token, data.assignments);
    } catch (err: any) {
      setLoginError(err.message || "بيانات الدخول غير صحيحة");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess(false);

    if (!forgotEmail || !forgotEmail.includes("@")) {
      setForgotError("الرجاء إدخال بريد إلكتروني صحيح");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch(`${BASE}/api/public/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "حدث خطأ");
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err.message || "حدث خطأ أثناء إرسال الطلب");
    } finally {
      setForgotLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return "الآن";
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "أمس";
      if (diffDays < 7) return `منذ ${diffDays} أيام`;
      return d.toLocaleDateString("ar-SA");
    } catch { return ""; }
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col p-10"
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #1a4480 25%, #1565c0 55%, #0d47a1 75%, #0a2e6e 100%)"
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="geo-shape geo-shape-1" />
          <div className="geo-shape geo-shape-2" />
          <div className="geo-shape geo-shape-3" />
          <div className="geo-shape geo-shape-4" />
          <div className="geo-shape geo-shape-5" />
        </div>

        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px"
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.25)" }}
            >
              <CloudRain className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-wide">منصة غيث</h1>
              <p className="text-blue-200 text-xs font-medium tracking-widest uppercase">Ghayth ERP Platform</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-5 overflow-hidden">
            {employeeOfMonth && (
              <div className="login-glass-card p-5 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-amber-300" />
                  <h3 className="text-sm font-bold text-white">الموظف المثالي — {MONTH_NAMES[employeeOfMonth.month]} {employeeOfMonth.year}</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.3)" }}
                  >
                    {employeeOfMonth.photoUrl ? (
                      <img src={employeeOfMonth.photoUrl} alt={employeeOfMonth.employeeName} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <User className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-base truncate">{employeeOfMonth.employeeName}</p>
                    {employeeOfMonth.jobTitle && (
                      <p className="text-blue-200 text-xs truncate">{employeeOfMonth.jobTitle}</p>
                    )}
                    {employeeOfMonth.branchName && (
                      <p className="text-blue-300 text-xs truncate">{employeeOfMonth.branchName}</p>
                    )}
                  </div>
                </div>
                {employeeOfMonth.reason && (
                  <p className="text-blue-100 text-xs mt-3 leading-relaxed line-clamp-2">{employeeOfMonth.reason}</p>
                )}
              </div>
            )}

            {announcements.length > 0 && (
              <div className="login-glass-card p-5 rounded-2xl flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="h-4 w-4 text-emerald-300" />
                  <h3 className="text-sm font-bold text-white">آخر الأخبار</h3>
                </div>
                <div className="space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                  {announcements.map(a => (
                    <div key={a.id} className="login-news-item p-3 rounded-xl">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white text-sm font-medium leading-snug flex-1">{a.title}</p>
                        <span className="text-blue-300 text-[10px] whitespace-nowrap flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatDate(a.publishedAt)}
                        </span>
                      </div>
                      {a.body && (
                        <p className="text-blue-200 text-xs mt-1 leading-relaxed line-clamp-2">{a.body}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!employeeOfMonth && announcements.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-white space-y-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold leading-relaxed">
                    نظام إدارة الموارد المؤسسية المتكامل
                  </h2>
                  <p className="text-blue-200 text-sm leading-relaxed">
                    أداة شاملة لإدارة عمليات المنشأة من الموارد البشرية والمالية إلى المشاريع والعمليات اليومية
                  </p>
                </div>
                <div className="space-y-3 text-right w-full max-w-xs">
                  {[
                    { icon: ShieldCheck, label: "أمان عالٍ وتحكم بالصلاحيات" },
                    { icon: Layers,      label: "وحدات متكاملة لكل قسم"      },
                    { icon: BarChart3,   label: "تقارير وتحليلات لحظية"       },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-3 login-glass-card rounded-xl px-4 py-2.5">
                      <Icon className="h-4 w-4 text-blue-300 shrink-0" />
                      <span className="text-sm text-blue-100">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 text-center text-blue-300 text-xs">
            مجموعة الدور &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-screen bg-gray-50">
        <div className="lg:hidden flex items-center gap-3 px-6 py-5 bg-white border-b border-gray-100 shadow-sm">
          <div className="p-2 rounded-xl shadow" style={{ background: "linear-gradient(135deg,#1565c0,#0d47a1)" }}>
            <CloudRain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-base leading-none">منصة غيث</p>
            <p className="text-xs text-gray-500">نظام إدارة الموارد المؤسسية</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            {currentView === "login" ? (
              <>
                <div className="mb-8 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
                    style={{ background: "linear-gradient(135deg,#1565c0,#0d47a1)" }}
                  >
                    <User className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">مرحباً بك</h2>
                  <p className="text-gray-500 text-sm mt-1">أدخل بياناتك للدخول إلى النظام</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  {loginError && (
                    <Alert className="border-red-200 bg-red-50 text-right">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-red-700 text-sm">{loginError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-gray-700 font-medium text-sm">البريد الإلكتروني</Label>
                    <div className="relative">
                      <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="ps-10 h-11 border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        autoComplete="email"
                        disabled={isLoading}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-gray-700 font-medium text-sm">كلمة المرور</Label>
                    <div className="relative">
                      <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="ps-10 pe-10 h-11 border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        autoComplete="current-password"
                        disabled={isLoading}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => { setCurrentView("forgot"); setLoginError(""); setForgotSuccess(false); setForgotError(""); setForgotEmail(""); }}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 rounded-lg text-white font-semibold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: isLoading ? "#64748b" : "linear-gradient(135deg,#1565c0,#0d47a1)" }}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري تسجيل الدخول...
                      </span>
                    ) : (
                      "تسجيل الدخول"
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg bg-amber-50 border border-amber-100">
                    <KeyRound className="h-7 w-7 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">استعادة كلمة المرور</h2>
                  <p className="text-gray-500 text-sm mt-1">أدخل بريدك الإلكتروني وسنرسل طلب الاستعادة لمدير النظام</p>
                </div>

                {forgotSuccess ? (
                  <div className="space-y-5">
                    <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center space-y-3">
                      <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                      <h3 className="text-lg font-semibold text-emerald-800">تم إرسال الطلب بنجاح</h3>
                      <p className="text-sm text-emerald-700 leading-relaxed">
                        تم تسجيل طلب استعادة كلمة المرور للبريد <strong dir="ltr">{forgotEmail}</strong>. سيقوم مدير النظام بمراجعة طلبك والتواصل معك.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCurrentView("login"); setForgotSuccess(false); setForgotEmail(""); }}
                      className="w-full h-11 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <ArrowRight className="h-4 w-4" />
                      العودة لتسجيل الدخول
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    {forgotError && (
                      <Alert className="border-red-200 bg-red-50 text-right">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-red-700 text-sm">{forgotError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email" className="text-gray-700 font-medium text-sm">البريد الإلكتروني</Label>
                      <div className="relative">
                        <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input
                          id="forgot-email"
                          type="email"
                          placeholder="example@company.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="ps-10 h-11 border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          autoComplete="email"
                          disabled={forgotLoading}
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full h-11 rounded-lg text-white font-semibold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: forgotLoading ? "#64748b" : "linear-gradient(135deg,#d97706,#b45309)" }}
                    >
                      {forgotLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جاري إرسال الطلب...
                        </span>
                      ) : (
                        "إرسال طلب الاستعادة"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setCurrentView("login"); setForgotError(""); setForgotEmail(""); }}
                      className="w-full h-11 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <ArrowRight className="h-4 w-4" />
                      العودة لتسجيل الدخول
                    </button>
                  </form>
                )}
              </>
            )}

            <p className="text-center text-xs text-gray-400 mt-8">
              مجموعة الدور &copy; {new Date().getFullYear()} — جميع الحقوق محفوظة
            </p>
            <p className="text-center text-xs text-gray-400 mt-2 leading-relaxed px-2">
              بتسجيل دخولك، أنت توافق على{" "}
              <a
                href="/api/pdpl/privacy-notice"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                سياسة الخصوصية
              </a>{" "}
              وفق نظام حماية البيانات الشخصية (PDPL)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
