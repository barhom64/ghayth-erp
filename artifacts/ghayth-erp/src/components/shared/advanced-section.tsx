import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";

/**
 * AdvancedSection — «الوضع المتقدم» الموحّد لصفحات الإنشاء.
 *
 * مبدأ «النظام يَحضُر لا يُحضَر له»: صفحة الإنشاء تطلب الحقيقة التشغيلية فقط،
 * والأبعاد المحاسبية/التنظيمية (الحساب، مركز التكلفة، الفرع، الأبعاد) تُشتق
 * تلقائيًا. هذا المكوّن يلفّ حقول النمذجة المتقدمة (التجاوز اليدوي) بحيث:
 *   - تكون **مطوية دائمًا** بشكل افتراضي.
 *   - لا يظهر زر فتحها إلا لمن يملك **صلاحية النمذجة** (perm) أو مستوى الدور.
 *   - يرى المستخدم العادي «الأثر المتوقع» (summary) للقراءة فقط، بلا حقول.
 *
 * مكوّن واحد مشترك تستخدمه كل صفحات الإنشاء — صفر تكرار.
 */
export interface AdvancedSectionProps {
  children: ReactNode;
  /** صلاحية فتح النمذجة المتقدمة (مثل "finance:update"). */
  perm?: string;
  /** الحد الأدنى لمستوى الدور حين لا تُمرَّر perm (افتراضي 50 = مدير). */
  minRoleLevel?: number;
  /** عنوان القسم. */
  title?: string;
  /** «الأثر المتوقع» — يُعرض دائمًا (حتى لغير المخوّل) للقراءة بدل الحقول. */
  summary?: ReactNode;
  /** فتح القسم ابتداءً (للمخوّلين فقط). الافتراضي: مطوي. */
  defaultOpen?: boolean;
  className?: string;
}

export function AdvancedSection({
  children,
  perm,
  minRoleLevel = 50,
  title = "نمذجة متقدمة (اختياري)",
  summary,
  defaultOpen = false,
  className = "",
}: AdvancedSectionProps) {
  const { can, roleLevel } = useAppContext();
  const allowed = perm ? can(perm) : roleLevel >= minRoleLevel;
  const [open, setOpen] = useState(defaultOpen && allowed);

  return (
    <div className={`rounded-xl border border-dashed border-border ${className}`}>
      {summary != null && (
        <div className="px-4 py-3 text-sm text-muted-foreground">{summary}</div>
      )}
      {allowed ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm font-medium hover:bg-surface-subtle rounded-xl"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> {title}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && <div className="px-4 pb-4 pt-3 space-y-4 border-t border-border">{children}</div>}
        </>
      ) : (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          الأبعاد المحاسبية والتنظيمية تُشتق تلقائيًا. التعديل اليدوي متاح لذوي صلاحية النمذجة.
        </div>
      )}
    </div>
  );
}
