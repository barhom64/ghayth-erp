import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout } from "@workspace/ui-core";
import { AlertCircle, ArrowLeft } from "lucide-react";

// #1812 operational review — the user's audit list explicitly called
// out: "صفحة 'رحلة جديدة' تكرر تدفق الحجز — احذفها أو حوّلها."
// ("New trip" page duplicates the booking flow — delete or redirect it.)
//
// The pre-#1733 trips-create form let an operator manually create a
// fleet_trips row WITHOUT going through the source → booking →
// dispatch pipeline. That's exactly the "transport as records" problem
// #1812 was opened to fix: a manually-typed trip skips the umrah link,
// skips the customer agreement, skips the assignment engine, and
// skips the cargo manifest. The user's #1733 booking + dispatch
// pipeline (and the #1812 planning engine on top of it) supersedes
// this surface entirely.
//
// To avoid 404s on bookmarked links + dashboard tiles + audit-log
// entries that reference /fleet/trips/create, the route is kept alive
// — but it now explains the migration in Arabic, redirects after 5
// seconds, and offers a manual "اذهب الآن" button. The old form is
// gone; the same operator action is performed via:
//
//   • Operator-driven booking → /fleet/transport/bookings/create
//   • Bulk plan from a source  → /fleet/transport/ops-dashboard
//   • Direct dispatch on an existing booking → /fleet/transport/dispatch
//
// Removing the legacy form deletes ~100 lines of duplicate UI; no
// route registration changes are needed (path /fleet/trips/create
// still resolves to this component via fleetRoutes.tsx).

const REDIRECT_TARGET = "/fleet/transport/bookings/create";
const REDIRECT_SECONDS = 5;

export default function TripsCreate() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const t = window.setTimeout(() => {
      setLocation(REDIRECT_TARGET);
    }, REDIRECT_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [setLocation]);

  return (
    <CreatePageLayout title="إنشاء رحلة جديدة" backPath="/fleet/trips">
      <Card className="border-status-warning-surface bg-status-warning-surface/20">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-status-warning-foreground shrink-0 mt-1" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-status-warning-foreground">
                هذه الشاشة استُبدلت بتدفق الحجز الجديد
              </h2>
              <p className="text-sm text-foreground">
                إنشاء رحلة يدوية بدون مصدر (حجز / طلب عميل / مجموعة عمرة) لم
                يعد مدعوماً — التدفق الجديد يربط كل رحلة بمصدرها ويمر عبر
                محرك الإسناد (سعة المركبة، فئة الرخصة، راحة السائق، اتفاق
                العميل) قبل إنشاء أمر التوزيع. هذا يضمن أثرَ تدقيقٍ كاملاً
                للمحاسبة وقواعدَ تشغيلية موحّدة.
              </p>
              <p className="text-sm text-muted-foreground">
                ستُحوَّل تلقائياً إلى نموذج الحجز خلال {REDIRECT_SECONDS} ثوانٍ،
                أو يمكنك الانتقال يدوياً الآن.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <Link href={REDIRECT_TARGET}>
              <Button className="w-full" rateLimitAware>
                <ArrowLeft className="h-4 w-4 ml-2" />
                إنشاء حجز جديد
              </Button>
            </Link>
            <Link href="/fleet/transport/ops-dashboard">
              <Button variant="outline" className="w-full">
                لوحة تشغيل النقل (خطة جماعية)
              </Button>
            </Link>
            <Link href="/fleet/transport/dispatch">
              <Button variant="outline" className="w-full">
                لوحة التوزيع
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </CreatePageLayout>
  );
}
