import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  FileText,
  Briefcase,
  LogOut,
  Save,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Upload,
  Link as LinkIcon,
} from "lucide-react";

interface Application {
  id: number;
  status: string;
  coverLetter?: string;
  createdAt: string;
  jobTitle: string;
  department?: string;
  location?: string;
}

export default function ProfilePage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [apps, setApps] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    nationalId: "",
    gender: "",
    dateOfBirth: "",
    city: "",
    education: "",
    experienceYears: "",
    skills: "",
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        nationalId: user.nationalId || "",
        gender: user.gender || "",
        dateOfBirth: user.dateOfBirth || "",
        city: user.city || "",
        education: user.education || "",
        experienceYears: user.experienceYears?.toString() || "",
        skills: user.skills || "",
      });
      setResumeUrl(user.resumeUrl || "");
    }
  }, [user]);

  useEffect(() => {
    if (tab === "applications" && user) {
      setAppsLoading(true);
      api.getMyApplications()
        .then(({ data }) => setApps(data))
        .catch(() => {})
        .finally(() => setAppsLoading(false));
    }
  }, [tab, user]);

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      await api.updateProfile({
        ...form,
        experienceYears: form.experienceYears ? parseInt(form.experienceYears) : null,
      });
      await refreshUser();
      setSaveMsg("تم حفظ البيانات بنجاح");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err: any) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResumeSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeUrl.trim()) return;
    setResumeSaving(true);
    setResumeMsg("");
    try {
      await api.updateResume(resumeUrl.trim());
      await refreshUser();
      setResumeMsg("تم حفظ رابط السيرة الذاتية بنجاح");
      setTimeout(() => setResumeMsg(""), 3000);
    } catch (err: any) {
      setResumeMsg(err.message || "فشل في الحفظ");
    } finally {
      setResumeSaving(false);
    }
  };

  const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
    new: { label: "جديد", color: "bg-blue-100 text-blue-700", icon: Clock },
    reviewing: { label: "قيد المراجعة", color: "bg-yellow-100 text-yellow-700", icon: Clock },
    shortlisted: { label: "في القائمة المختصرة", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
    interview: { label: "مقابلة", color: "bg-indigo-100 text-indigo-700", icon: Briefcase },
    accepted: { label: "مقبول", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    rejected: { label: "مرفوض", color: "bg-red-100 text-red-700", icon: XCircle },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-gradient-to-l from-[#1e3a5f] to-[#0a2e6e] text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20">
                <User className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{user.name}</h1>
                <p className="text-blue-200 text-sm">{user.email}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => navigate("/")}
              >
                <ArrowRight className="w-4 h-4 ml-1" />
                الوظائف
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => { logout(); navigate("/login"); }}
              >
                <LogOut className="w-4 h-4 ml-1" />
                خروج
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="w-full grid grid-cols-2 h-12">
            <TabsTrigger value="profile" className="gap-2 text-base">
              <User className="w-4 h-4" />
              الملف الشخصي
            </TabsTrigger>
            <TabsTrigger value="applications" className="gap-2 text-base">
              <FileText className="w-4 h-4" />
              طلباتي
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-bold mb-6">البيانات الشخصية</h2>
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>الاسم الكامل</Label>
                      <Input value={form.name} onChange={(e) => update("name", e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>رقم الجوال</Label>
                      <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>رقم الهوية</Label>
                      <Input value={form.nationalId} onChange={(e) => update("nationalId", e.target.value)} dir="ltr" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>الجنس</Label>
                      <select
                        value={form.gender}
                        onChange={(e) => update("gender", e.target.value)}
                        className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">اختر</option>
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>تاريخ الميلاد</Label>
                      <Input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} dir="ltr" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>المدينة</Label>
                      <Input value={form.city} onChange={(e) => update("city", e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>المؤهل العلمي</Label>
                      <Input value={form.education} onChange={(e) => update("education", e.target.value)} className="h-11" placeholder="بكالوريوس / ماجستير / ..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label>سنوات الخبرة</Label>
                      <Input type="number" min="0" value={form.experienceYears} onChange={(e) => update("experienceYears", e.target.value)} dir="ltr" className="h-11" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>المهارات</Label>
                    <textarea
                      value={form.skills}
                      onChange={(e) => update("skills", e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="مثال: Excel, إدارة مشاريع, برمجة Python"
                    />
                  </div>

                  {saveMsg && (
                    <div className={`rounded-lg p-3 text-sm ${saveMsg.includes("بنجاح") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      {saveMsg}
                    </div>
                  )}

                  <Button type="submit" disabled={saving} className="gap-2" rateLimitAware>
                    <Save className="w-4 h-4" />
                    {saving ? "جاري الحفظ..." : "حفظ البيانات"}
                  </Button>
                </form>

                <div className="border-t pt-5 mt-5">
                  <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    السيرة الذاتية
                  </h3>
                  {user?.resumeUrl && (
                    <div className="flex items-center gap-2 mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <LinkIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <a href={user.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 hover:underline truncate">
                        {user.resumeUrl}
                      </a>
                    </div>
                  )}
                  <form onSubmit={handleResumeSave} className="flex gap-2">
                    <Input
                      type="url"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      placeholder="https://drive.google.com/... أو رابط السيرة الذاتية"
                      dir="ltr"
                      className="h-10 flex-1"
                    />
                    <Button type="submit" disabled={resumeSaving || !resumeUrl.trim()} size="sm" className="gap-1 whitespace-nowrap" rateLimitAware>
                      <Save className="w-3.5 h-3.5" />
                      {resumeSaving ? "حفظ..." : "حفظ الرابط"}
                    </Button>
                  </form>
                  {resumeMsg && (
                    <p className={`mt-2 text-xs ${resumeMsg.includes("بنجاح") ? "text-green-600" : "text-red-600"}`}>{resumeMsg}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    أدخل رابطاً مباشراً لسيرتك الذاتية (Google Drive, Dropbox, أو أي رابط مشاركة)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications">
            {appsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-5 bg-muted rounded w-40 mb-3" />
                      <div className="h-4 bg-muted rounded w-28" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : apps.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground mb-1">
                    لا توجد طلبات بعد
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    تصفح الوظائف المتاحة وقدّم طلبك الأول
                  </p>
                  <Button onClick={() => navigate("/")}>
                    <Briefcase className="w-4 h-4 ml-2" />
                    تصفح الوظائف
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {apps.map((app) => {
                  const st = statusLabels[app.status] || statusLabels.new;
                  const Icon = st.icon;
                  return (
                    <Card key={app.id}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-lg mb-1">{app.jobTitle}</h3>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              {app.department && <span>{app.department}</span>}
                              {app.location && <span>{app.location}</span>}
                              <span>
                                {new Date(app.createdAt).toLocaleDateString("ar-SA", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          </div>
                          <Badge className={`${st.color} gap-1 border-0`}>
                            <Icon className="w-3.5 h-3.5" />
                            {st.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
