import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Settings2, Calendar, Languages } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * بطاقة "تفضيلاتي" — نوع التقويم (هجري | ميلادي) ولغة الواجهة
 * (العربية | الإنجليزية). الاختيار يُحفَظ على الـserver عبر
 * PATCH /auth/me/preferences ويَتبع المستخدم بين الأجهزة. الـUI كاملًا
 * (date pickers، تنسيقات التواريخ في PDFs، الإيميلات، التقارير) يَستهلك
 * هذا التفضيل تلقائيًا من خلال AuthContext.
 */
export function PreferencesCard() {
  const { user, setPreferences } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "calendar" | "locale">(null);

  const updateCalendar = async (value: "hijri" | "gregorian") => {
    if (busy || user?.preferredCalendar === value) return;
    setBusy("calendar");
    try {
      await setPreferences({ preferredCalendar: value });
      toast({ description: "تم حفظ التقويم المُفضّل" });
    } catch (e) {
      toast({ description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const updateLocale = async (value: "ar" | "en") => {
    if (busy || user?.preferredLocale === value) return;
    setBusy("locale");
    try {
      await setPreferences({ preferredLocale: value });
      toast({ description: "تم حفظ اللغة المُفضّلة" });
    } catch (e) {
      toast({ description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const calendar = user?.preferredCalendar ?? "hijri";
  const locale = user?.preferredLocale ?? "ar";

  const Option = ({
    selected, disabled, onClick, children,
  }: { selected: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={
        "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors " +
        (selected
          ? "bg-indigo-500 text-white shadow-sm"
          : "bg-surface-subtle text-muted-foreground hover:bg-surface")
        + (disabled ? " opacity-60 cursor-not-allowed" : " cursor-pointer")
      }
    >
      {children}
    </button>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-indigo-500" />
          تفضيلاتي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            التقويم المُفضّل
          </Label>
          <div className="flex gap-2">
            <Option
              selected={calendar === "hijri"}
              disabled={busy === "calendar"}
              onClick={() => updateCalendar("hijri")}
            >
              هجري
            </Option>
            <Option
              selected={calendar === "gregorian"}
              disabled={busy === "calendar"}
              onClick={() => updateCalendar("gregorian")}
            >
              ميلادي
            </Option>
          </div>
          <p className="text-xs text-muted-foreground">
            يُطبَّق فورًا على جميع حقول التاريخ، الإيصالات، والتقارير.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Languages className="w-4 h-4 text-muted-foreground" />
            لغة الواجهة
          </Label>
          <div className="flex gap-2">
            <Option
              selected={locale === "ar"}
              disabled={busy === "locale"}
              onClick={() => updateLocale("ar")}
            >
              العربية
            </Option>
            <Option
              selected={locale === "en"}
              disabled={busy === "locale"}
              onClick={() => updateLocale("en")}
            >
              English
            </Option>
          </div>
          <p className="text-xs text-muted-foreground">
            العربية هي اللغة الأساسية. الإنجليزية متاحة جزئيًا في هذه المرحلة.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
