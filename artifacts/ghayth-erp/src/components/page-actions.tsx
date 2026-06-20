import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { RefreshCw, Download, Printer, ArrowRight } from "lucide-react";
import { usePermission } from "@/components/shared/permission-gate";

/**
 * PageActions — الشريط الموحّد لأزرار الصفحة (الطباعة/التصدير/التحديث/الرجوع +
 * الأزرار المهمة الخاصة بكل صفحة). يُوضع في خانة `actions` الثابتة بـ PageShell،
 * فيظهر بنفس المكان والشكل في كل النظام.
 *
 * كل زر «رمز موحّد»: أيقونة فقط، تتمدّد عند المرور لتُظهر الاسم العربي. الأفعال
 * الشائعة لها مكوّنات جاهزة (RefreshAction / ExportAction / PrintAction /
 * BackAction)، والأفعال الخاصة تُمرَّر كـ <PageActionButton …/> أو أي عنصر.
 *
 *   <PageShell title="…" actions={
 *     <PageActions>
 *       <RefreshAction onRefresh={refetch} />
 *       <ExportAction onExport={exportCsv} />
 *       <PrintAction />
 *       <PageActionButton icon={Plus} label="جديد" tone="primary" href="…/create" />
 *     </PageActions>
 *   }>
 */

export function PageActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="page-actions">
      {children}
    </div>
  );
}

type Tone = "default" | "primary" | "danger";

const TONE: Record<Tone, string> = {
  default: "text-muted-foreground hover:text-foreground border-border",
  primary: "text-primary border-primary/40 hover:bg-primary/5",
  danger: "text-destructive border-destructive/40 hover:bg-destructive/5",
};

/**
 * زر إجراء موحّد: أيقونة فقط افتراضيًّا، تتمدّد لتُظهر النص عند المرور/التركيز.
 * يقبل onClick أو href (رابط داخلي عبر wouter).
 */
export function PageActionButton({
  icon: Icon, label, onClick, href, tone = "default", disabled, testid, perm, permMode = "all",
}: {
  icon: any;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: Tone;
  disabled?: boolean;
  testid?: string;
  /** صلاحية مطلوبة — يُخفى الزر إن لم يملكها المستخدم (كـ GuardedButton). */
  perm?: string | string[];
  permMode?: "all" | "any";
}) {
  // يُستدعى دائمًا (قاعدة الـhooks)؛ مصفوفة فارغة = مسموح.
  const allowed = usePermission(perm ?? [], permMode);
  if (perm && !allowed) return null;
  const className = cn(
    "group/pa inline-flex items-center rounded-md border bg-background px-2.5 py-2 transition-all",
    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    disabled && "opacity-50 pointer-events-none",
    TONE[tone],
  );
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {/* يتمدّد عند المرور/التركيز ليُظهر الاسم */}
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm opacity-0 transition-all duration-200 group-hover/pa:ms-2 group-hover/pa:max-w-[12rem] group-hover/pa:opacity-100 group-focus-visible/pa:ms-2 group-focus-visible/pa:max-w-[12rem] group-focus-visible/pa:opacity-100">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <a title={label} aria-label={label} data-testid={testid} className={className}>
          {body}
        </a>
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {body}
    </button>
  );
}

// ── الأفعال الموحّدة الشائعة ─────────────────────────────────────────────────

/** تحديث البيانات (إعادة التحميل). */
export function RefreshAction({ onRefresh, disabled }: { onRefresh: () => void; disabled?: boolean }) {
  return <PageActionButton icon={RefreshCw} label="تحديث" onClick={onRefresh} disabled={disabled} testid="action-refresh" />;
}

/** تصدير البيانات (جدولي/CSV). يقبل صلاحية اختيارية (يُخفى إن لم تُتح). */
export function ExportAction({ onExport, disabled, perm, permMode }: {
  onExport: () => void; disabled?: boolean; perm?: string | string[]; permMode?: "all" | "any";
}) {
  return <PageActionButton icon={Download} label="تصدير" onClick={onExport} disabled={disabled} perm={perm} permMode={permMode} testid="action-export" />;
}

/** طباعة الصفحة. افتراضيًّا window.print()، أو معالج مخصّص. */
export function PrintAction({ onPrint }: { onPrint?: () => void }) {
  return <PageActionButton icon={Printer} label="طباعة" onClick={onPrint ?? (() => window.print())} testid="action-print" />;
}

/** رجوع للخلف (التاريخ)، أو إلى مسار محدّد عبر `to`. */
export function BackAction({ to }: { to?: string }) {
  const [, navigate] = useLocation();
  return (
    <PageActionButton
      icon={ArrowRight}
      label="رجوع"
      onClick={() => (to ? navigate(to) : window.history.back())}
      testid="action-back"
    />
  );
}
