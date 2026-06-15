import { type ReactNode } from "react";
import { AlertTriangle, Info, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * ConfirmActionDialog — UI-unification §6.2.
 *
 * Companion primitive to <ConfirmDeleteDialog>. ConfirmDeleteDialog is
 * locked to the delete semantics (impact-preview endpoint, DELETE HTTP
 * verb, blockers from 409 CONFLICT). This component covers the *other*
 * 21 places in the tree that hand-roll <AlertDialog> for non-delete
 * confirmations: close period, reverse journal, cancel invoice, apply
 * discipline, year-end close, deactivate user, ...
 *
 * The audit (docs/audit/UI_LIBRARY_UNIFICATION_AUDIT.md §6.2) called for
 * a `ConfirmActionDialog` with three variants:
 *
 *   - "destructive"  → red, AlertTriangle      (close period, cancel invoice)
 *   - "caution"      → amber, ShieldAlert      (deactivate, force override)
 *   - "confirm"      → neutral, Info           (apply, mark done, finalize)
 *
 * The dialog is intentionally *presentational*: the caller decides what
 * the mutation does. ConfirmActionDialog only owns the chrome: open
 * state, title, body, two buttons, pending spinner. That keeps it
 * unbiased about HTTP verb / endpoint / cache keys — which is why we
 * couldn't just extend ConfirmDeleteDialog with a variant prop.
 *
 * Usage:
 *
 *   const [confirming, setConfirming] = useState(false);
 *   // closeMut is shown as pseudocode (real endpoint is
 *   // /finance/fiscal-periods/:period/year-end-close); see
 *   // finance-journal.ts for the wired call site.
 *
 *   <Button onClick={() => setConfirming(true)}>إقفال السنة</Button>
 *
 *   <ConfirmActionDialog
 *     open={confirming}
 *     onOpenChange={setConfirming}
 *     variant="destructive"
 *     title="تأكيد إقفال السنة المالية"
 *     description="سيتم نقل الأرصدة وقفل السنة. لا يمكن التراجع."
 *     confirmLabel="تأكيد الإقفال"
 *     pending={closeMut.isPending}
 *     onConfirm={() => closeMut.mutate({ year })}
 *   />
 *
 * Why not extend ConfirmDeleteDialog with a variant prop?
 *   - ConfirmDeleteDialog hard-codes the DELETE verb and the
 *     /impact-preview probe. Both are wrong for non-delete actions.
 *   - The two components share the same shadcn AlertDialog primitive
 *     (and the same RTL chrome), so duplicating the structural shell
 *     costs ~80 lines and buys us a cleaner API.
 */

export type ConfirmActionVariant = "destructive" | "caution" | "confirm";

export interface ConfirmActionDialogProps {
  /** Dialog visibility. */
  open: boolean;
  /** Visibility change handler. Called with `false` on cancel/close. */
  onOpenChange: (open: boolean) => void;
  /** Confirmation title (Arabic). */
  title: ReactNode;
  /** Body text describing what will happen. */
  description: ReactNode;
  /**
   * Visual variant.
   *   - "destructive" — red, for irreversible operations
   *     (close period, cancel invoice, reverse journal).
   *   - "caution" — amber, for risky-but-reversible
   *     (deactivate user, force override).
   *   - "confirm" — neutral, for non-risky confirmations
   *     (apply, finalize, mark done).
   * Defaults to "destructive".
   */
  variant?: ConfirmActionVariant;
  /** Confirm button label. Defaults to "تأكيد". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "إلغاء". */
  cancelLabel?: string;
  /**
   * Called when the user confirms. The dialog does NOT close itself —
   * the caller decides (most mutations close on success in their
   * onSuccess callback, on failure they keep the dialog open).
   */
  onConfirm: () => void;
  /** Show a spinner + disable buttons. Use the mutation's isPending. */
  pending?: boolean;
  /** Extra disabled state (e.g. form has unresolved validation). */
  disabled?: boolean;
  /**
   * Optional extra body content rendered between the description and
   * the buttons — useful for showing a list of impacts, a textarea for
   * a reason, a checkbox to acknowledge, etc.
   */
  children?: ReactNode;
  /** data-testid placed on AlertDialogContent (for E2E tests). */
  contentTestId?: string;
  /** data-testid placed on the confirm button (for E2E tests). */
  confirmButtonTestId?: string;
}

interface VariantStyles {
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  buttonVariant: "destructive" | "default";
  pendingLabel: string;
}

const VARIANT_STYLES: Record<ConfirmActionVariant, VariantStyles> = {
  destructive: {
    Icon: AlertTriangle,
    iconClass: "text-status-error-foreground",
    buttonVariant: "destructive",
    pendingLabel: "جاري التنفيذ…",
  },
  caution: {
    Icon: ShieldAlert,
    iconClass: "text-status-warning-foreground",
    buttonVariant: "default",
    pendingLabel: "جاري التنفيذ…",
  },
  confirm: {
    Icon: Info,
    iconClass: "text-status-info-foreground",
    buttonVariant: "default",
    pendingLabel: "جاري الحفظ…",
  },
};

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "destructive",
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  onConfirm,
  pending = false,
  disabled = false,
  children,
  contentTestId,
  confirmButtonTestId,
}: ConfirmActionDialogProps) {
  const styles = VARIANT_STYLES[variant];
  const Icon = styles.Icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="max-w-lg" data-testid={contentTestId}>
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${styles.iconClass}`} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1 text-start">
              <div className="text-sm text-muted-foreground">{description}</div>
              {children}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-start gap-2">
          <Button
            variant={styles.buttonVariant}
            size="sm"
            onClick={onConfirm}
            disabled={pending || disabled}
            className="gap-1.5"
            rateLimitAware
            data-testid={confirmButtonTestId}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {styles.pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
