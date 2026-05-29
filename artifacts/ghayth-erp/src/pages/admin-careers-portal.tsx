/**
 * Careers portal admin preview — exercises every endpoint exposed by
 * the `/careers` recruitment portal so HR can test the candidate flow
 * without leaving the back-office.
 *
 * Endpoints (9):
 *   POST  /careers/auth/register      — candidate signup
 *   POST  /careers/auth/login         — candidate login
 *   GET   /careers/jobs               — open job list (public)
 *   GET   /careers/jobs/:id           — single job detail
 *   GET   /careers/me                 — current candidate profile
 *   PATCH /careers/me                 — update profile
 *   PATCH /careers/me/resume          — update resume metadata
 *   GET   /careers/my-applications    — submitted applications
 *   POST  /careers/apply              — submit application (already wired
 *                                       on the careers page; this here is
 *                                       admin preview)
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, User, FileText, Send, KeyRound, UserPlus } from "lucide-react";

export default function CareersPortalAdminPage() {
  const { toast } = useToast();

  const jobsQ = useApiQuery<{ data: any[] }>(["careers-jobs"], "/careers/jobs");
  const jobs = jobsQ.data?.data ?? [];

  const [jobId, setJobId] = useState<number | null>(null);
  const jobDetailQ = useApiQuery<any>(
    ["careers-job", String(jobId ?? 0)],
    jobId ? `/careers/jobs/${jobId}` : null,
    !!jobId,
  );

  const meQ = useApiQuery<any>(["careers-me"], "/careers/me");
  const myAppsQ = useApiQuery<{ data: any[] }>(["careers-my-apps"], "/careers/my-applications");

  // ── register
  const [regForm, setRegForm] = useState({ email: "", password: "", fullName: "" });
  const handleRegister = async () => {
    try {
      await apiFetch("/careers/auth/register", {
        method: "POST",
        body: JSON.stringify(regForm),
      });
      toast({ title: "تم إنشاء حساب المرشّح" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التسجيل", description: err?.message });
    }
  };

  // ── login
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const handleLogin = async () => {
    try {
      await apiFetch("/careers/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      toast({ title: "تم تسجيل الدخول" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الدخول", description: err?.message });
    }
  };

  // ── update profile
  const [profileDraft, setProfileDraft] = useState({ phone: "", city: "" });
  const handleUpdateMe = async () => {
    try {
      await apiFetch("/careers/me", {
        method: "PATCH",
        body: JSON.stringify(profileDraft),
      });
      toast({ title: "تم تحديث الملف" });
      meQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التحديث", description: err?.message });
    }
  };

  // ── update resume
  const [resumeUrl, setResumeUrl] = useState("");
  const handleUpdateResume = async () => {
    try {
      await apiFetch("/careers/me/resume", {
        method: "PATCH",
        body: JSON.stringify({ resumeUrl }),
      });
      toast({ title: "تم تحديث السيرة الذاتية" });
      meQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الرفع", description: err?.message });
    }
  };

  // ── apply
  const handleApply = async () => {
    if (!jobId) {
      toast({ variant: "destructive", title: "اختر وظيفة أولاً" });
      return;
    }
    try {
      await apiFetch("/careers/apply", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
      toast({ title: "تم تقديم الطلب" });
      myAppsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التقديم", description: err?.message });
    }
  };

  return (
    <PageShell
      title="معاينة بوابة التوظيف"
      subtitle="معاينة وتجربة بوابة المرشّحين، يستخدمها HR للتحقّق من تجربة المتقدّمين"
      breadcrumbs={[{ label: "الإدارة" }, { label: "بوابة التوظيف" }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── auth */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-status-info" />تسجيل / دخول
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="border-b pb-2 space-y-1">
              <Label className="text-[10px]">حساب جديد</Label>
              <Input
                placeholder="الاسم"
                value={regForm.fullName}
                onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                className="h-7 text-xs"
              />
              <Input
                placeholder="email"
                dir="ltr"
                value={regForm.email}
                onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                className="h-7 text-xs"
              />
              <Input
                placeholder="password"
                dir="ltr"
                type="password"
                value={regForm.password}
                onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                className="h-7 text-xs"
              />
              <GuardedButton perm="admin:create" size="sm" rateLimitAware onClick={handleRegister}>
                <UserPlus className="h-3 w-3 me-1" />إنشاء حساب
              </GuardedButton>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">تسجيل دخول</Label>
              <Input
                placeholder="email"
                dir="ltr"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="h-7 text-xs"
              />
              <Input
                placeholder="password"
                dir="ltr"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="h-7 text-xs"
              />
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleLogin}>
                <KeyRound className="h-3 w-3 me-1" />دخول
              </GuardedButton>
            </div>
          </CardContent>
        </Card>

        {/* ── profile */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />ملفي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {meQ.isLoading ? <LoadingSpinner /> : meQ.data ? (
              <div className="grid grid-cols-2 gap-1 border rounded p-2 bg-muted/30">
                {Object.entries(meQ.data).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
                  <span key={k}>{k}: <span className="font-mono">{String(v)}</span></span>
                ))}
              </div>
            ) : <p className="text-muted-foreground">لم يتم تسجيل الدخول.</p>}
            <div className="border-t pt-2 space-y-1">
              <Label className="text-[10px]">تحديث بيانات الاتصال</Label>
              <Input
                placeholder="الهاتف"
                value={profileDraft.phone}
                onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })}
                className="h-7 text-xs"
              />
              <Input
                placeholder="المدينة"
                value={profileDraft.city}
                onChange={(e) => setProfileDraft({ ...profileDraft, city: e.target.value })}
                className="h-7 text-xs"
              />
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleUpdateMe}>حفظ</GuardedButton>
            </div>
            <div className="border-t pt-2 space-y-1">
              <Label className="text-[10px]">السيرة الذاتية (رابط)</Label>
              <Input
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                dir="ltr"
                className="h-7 text-xs font-mono"
                placeholder="https://..."
              />
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleUpdateResume}>
                <FileText className="h-3 w-3 me-1" />تحديث السيرة
              </GuardedButton>
            </div>
          </CardContent>
        </Card>

        {/* ── jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" />الوظائف المتاحة ({jobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs max-h-64 overflow-y-auto">
              {jobsQ.isLoading ? <LoadingSpinner /> : jobs.length === 0 ? (
                <p className="p-3 text-muted-foreground text-center">لا توجد وظائف منشورة.</p>
              ) : jobs.map((j: any) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setJobId(j.id)}
                  className={`w-full px-3 py-2 text-start hover:bg-surface-subtle ${
                    jobId === j.id ? "bg-status-info-surface/40" : ""
                  }`}
                >
                  <span className="font-medium">{j.title}</span>
                  {j.location && <span className="ms-2 text-muted-foreground text-[10px]">{j.location}</span>}
                </button>
              ))}
            </div>
            {jobDetailQ.data && (
              <div className="border-t p-2 space-y-2 text-[10px]">
                <p className="font-medium">{jobDetailQ.data.title}</p>
                {jobDetailQ.data.description && (
                  <p className="text-muted-foreground whitespace-pre-wrap">{jobDetailQ.data.description}</p>
                )}
                <GuardedButton perm="admin:create" size="sm" rateLimitAware onClick={handleApply}>
                  <Send className="h-3 w-3 me-1" />تقديم
                </GuardedButton>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── my applications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />طلباتي ({(myAppsQ.data?.data ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs max-h-64 overflow-y-auto">
              {(myAppsQ.data?.data ?? []).length === 0 ? (
                <p className="p-3 text-muted-foreground text-center">لا توجد طلبات.</p>
              ) : (myAppsQ.data?.data ?? []).slice(0, 30).map((a: any) => (
                <div key={a.id} className="px-3 py-1.5 flex items-center justify-between">
                  <span>{a.jobTitle ?? `وظيفة #${a.jobId}`}</span>
                  <span className="text-muted-foreground text-[10px]">{a.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PageShell>
  );
}
