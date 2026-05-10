import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, MapPin, Clock, Search, Building2, DollarSign, ChevronLeft } from "lucide-react";

interface Job {
  id: number;
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  requirements: string;
  salaryMin: number;
  salaryMax: number;
  closingDate: string;
  createdAt: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    api.getJobs()
      .then(({ data }) => setJobs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(
    (j) =>
      j.title?.toLowerCase().includes(search.toLowerCase()) ||
      j.department?.toLowerCase().includes(search.toLowerCase()) ||
      j.location?.toLowerCase().includes(search.toLowerCase())
  );

  const typeLabels: Record<string, string> = {
    "full-time": "دوام كامل",
    "part-time": "دوام جزئي",
    contract: "عقد مؤقت",
    remote: "عن بُعد",
  };

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-l from-[#1e3a5f] to-[#0a2e6e] text-white">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">الوظائف المتاحة</h1>
              <p className="text-blue-200">
                انضم لفريق مجموعة الدور — نبحث عن الكفاءات المتميزة
              </p>
            </div>
            <div className="flex gap-3">
              {user ? (
                <Button
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => navigate("/profile")}
                >
                  ملفي الشخصي
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    onClick={() => navigate("/login")}
                  >
                    تسجيل الدخول
                  </Button>
                  <Button
                    className="bg-white text-[#1e3a5f] hover:bg-blue-50"
                    onClick={() => navigate("/register")}
                  >
                    إنشاء حساب
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="relative max-w-xl">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
            <Input
              placeholder="ابحث عن وظيفة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-12 bg-white/10 border-white/20 text-white placeholder:text-blue-200 h-12 text-base"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded w-48 mb-3" />
                  <div className="h-4 bg-muted rounded w-32 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-1">
              لا توجد وظائف متاحة حالياً
            </h3>
            <p className="text-sm text-muted-foreground">
              تابعنا للحصول على أحدث الفرص الوظيفية
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground mb-2">
              {filtered.length} وظيفة متاحة
            </p>
            {filtered.map((job) => (
              <Card
                key={job.id}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => setSelectedJob(job)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground mb-2">
                        {job.title}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                        {job.department && (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4" />
                            {job.department}
                          </span>
                        )}
                        {job.location && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            {job.location}
                          </span>
                        )}
                        {job.type && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {typeLabels[job.type] || job.type}
                          </span>
                        )}
                        {(job.salaryMin || job.salaryMax) && (
                          <span className="flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4" />
                            {job.salaryMin && job.salaryMax
                              ? `${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()} ر.س`
                              : job.salaryMin
                                ? `من ${job.salaryMin.toLocaleString()} ر.س`
                                : `حتى ${job.salaryMax.toLocaleString()} ر.س`}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {job.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 mr-4">
                      <Badge variant="secondary">
                        {typeLabels[job.type] || job.type || "وظيفة"}
                      </Badge>
                      {job.closingDate && (
                        <span className="text-xs text-muted-foreground">
                          آخر موعد: {new Date(job.closingDate).toLocaleDateString("ar-SA")}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function JobDetail({ job, onBack }: { job: Job; onBack: () => void }) {
  const [applying, setApplying] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const hasResume = user?.resumeUrl;

  const typeLabels: Record<string, string> = {
    "full-time": "دوام كامل",
    "part-time": "دوام جزئي",
    contract: "عقد مؤقت",
    remote: "عن بُعد",
  };

  const handleApply = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setApplying(true);
    setError("");
    try {
      const result = await api.apply({ postingId: job.id, coverLetter });
      setMessage(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-l from-[#1e3a5f] to-[#0a2e6e] text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            العودة للوظائف
          </button>
          <h1 className="text-2xl font-bold mb-2">{job.title}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-blue-200">
            {job.department && (
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {job.department}
              </span>
            )}
            {job.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {job.location}
              </span>
            )}
            {job.type && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {typeLabels[job.type] || job.type}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {job.description && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold mb-3">وصف الوظيفة</h2>
                  <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                    {job.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {job.requirements && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold mb-3">المتطلبات</h2>
                  <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                    {job.requirements}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-lg">تقديم الطلب</h3>

                {message ? (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
                    {message}
                  </div>
                ) : (
                  <>
                    {!user && (
                      <p className="text-sm text-muted-foreground">
                        يجب تسجيل الدخول أو إنشاء حساب للتقديم
                      </p>
                    )}

                    {user && (
                      <div className="space-y-3">
                        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${hasResume ? "bg-green-50 border border-green-200 text-green-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                          {hasResume ? (
                            <>
                              <span>✓</span>
                              <span>سيتم إرفاق سيرتك الذاتية تلقائياً</span>
                            </>
                          ) : (
                            <>
                              <span>⚠</span>
                              <span>
                                لم تُرفق سيرة ذاتية.{" "}
                                <button onClick={() => navigate("/profile")} className="underline font-medium">
                                  أضفها من ملفك الشخصي
                                </button>
                              </span>
                            </>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">
                            رسالة التغطية (اختياري)
                          </label>
                          <textarea
                            value={coverLetter}
                            onChange={(e) => setCoverLetter(e.target.value)}
                            rows={4}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="اكتب لماذا أنت مناسب لهذه الوظيفة..."
                          />
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                        {error}
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={handleApply}
                      disabled={applying}
                      rateLimitAware
                    >
                      {applying
                        ? "جاري التقديم..."
                        : user
                          ? "تقديم الطلب"
                          : "تسجيل الدخول للتقديم"}
                    </Button>
                  </>
                )}

                {(job.salaryMin || job.salaryMax) && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-muted-foreground mb-1">نطاق الراتب</p>
                    <p className="font-semibold">
                      {job.salaryMin && job.salaryMax
                        ? `${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()} ر.س`
                        : job.salaryMin
                          ? `من ${job.salaryMin.toLocaleString()} ر.س`
                          : `حتى ${job.salaryMax.toLocaleString()} ر.س`}
                    </p>
                  </div>
                )}

                {job.closingDate && (
                  <div className="pt-3 border-t">
                    <p className="text-sm text-muted-foreground mb-1">آخر موعد للتقديم</p>
                    <p className="font-semibold">
                      {new Date(job.closingDate).toLocaleDateString("ar-SA", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
