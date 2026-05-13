import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CloudRain, Home, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100" dir="rtl">
      <div className="text-center px-6 max-w-lg">
        <div className="mx-auto mb-6 p-4 bg-status-info-surface rounded-full w-fit">
          <CloudRain className="h-12 w-12 text-blue-400" />
        </div>
        <h1 className="text-8xl font-bold text-status-info-foreground mb-2">٤٠٤</h1>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground mb-8">
          عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها إلى مكان آخر.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button className="gap-2">
              <Home className="h-4 w-4" />
              الصفحة الرئيسية
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={() => window.history.back()}>
            <ArrowRight className="h-4 w-4" />
            العودة للخلف
          </Button>
        </div>
      </div>
    </div>
  );
}
