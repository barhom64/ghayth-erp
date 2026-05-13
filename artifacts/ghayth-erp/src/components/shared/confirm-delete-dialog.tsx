import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, useApiMutation, ApiError } from "@/lib/api";

/**
 * ConfirmDeleteDialog — R.1.4 of the Reference UI/UX phase.
 *
 * The canonical destructive-action confirm. Replaces every bespoke
 * "are you sure?" card that's been copy-pasted into list pages over
 * the past year. Wraps the existing radix AlertDialog primitive, the
 * existing `/impact-preview` endpoint, and the existing `useApiMutation`
 * hook — no new backend, no new library, no new design language.
 *
 * Flow:
 *
 *   1. Caller sets `open = true` with an entity reference and a delete
 *      path.
 *   2. The dialog fetches `/impact-preview` in the background so the
 *      user sees what will be affected if the delete succeeds. Loading
 *      state renders a spinner line instead of blocking the dialog.
 *   3. On confirm, the dialog calls the delete endpoint via
 *      `useApiMutation`. Success → success toast + close + invalidate
 *      the caller's query keys. Network error → default error toast.
 *   4. If the server refuses with `409 CONFLICT` and ships
 *      `meta.blockers: string[]` (Phase C.7b delete guards: vendors
 *      with open POs, accounts with journal lines, budgets with used
 *      amount, active bank guarantees, etc.), the dialog:
 *        • Keeps itself open
 *        • Renders the blockers as a red card inside the dialog body
 *        • Lets the user read what to close first, then cancel
 *      This is the key UX moment the architectural hardening was
 *      supposed to deliver: the user sees the *specific* things they
 *      need to resolve, not a generic "cannot delete".
 *
 * Usage:
 *
 *   const [deleting, setDeleting] = useState<{id:number; name:string}|null>(null);
 *
 *   <Button onClick={() => setDeleting({ id: row.id, name: row.name })}>
 *     حذف
 *   </Button>
 *
 *   <ConfirmDeleteDialog
 *     open={deleting !== null}
 *     onOpenChange={(v) => !v && setDeleting(null)}
 *     entity={{
 *       type: "supplier",
 *       id: deleting?.id ?? 0,
 *       name: deleting?.name ?? "",
 *     }}
 *     deletePath={`/finance/vendors/${deleting?.id}`}
 *     invalidateKeys={[["finance", "vendors"]]}
 *     onDeleted={() => setDeleting(null)}
 *   />
 *
 * Note: the component does NOT decide whether to show the trigger. It
 * just manages the dialog state. Callers keep their own visibility
 * rules (role check, row selection, etc.) outside this component.
 */

interface ImpactItem {
  type: string;
  icon: string;
  label: string;
  detail: string;
}

export interface ConfirmDeleteDialogProps {
  /** Dialog visibility. */
  open: boolean;
  /** Visibility change handler (called with `false` on cancel/close). */
  onOpenChange: (open: boolean) => void;
  /**
   * The entity being deleted. `type` drives the `/impact-preview` call
   * (e.g. "supplier", "account", "project"). `id` is the primary key.
   * `name` is the arabic display label shown inside the dialog.
   */
  entity: {
    type: string;
    id: number;
    name: string;
  };
  /**
   * Relative path to hit with `DELETE`. Must start with `/` (no `/api`
   * prefix — `apiFetch` adds it). Example: `/finance/vendors/42`.
   */
  deletePath: string;
  /**
   * Query keys to invalidate on successful delete. Use the same keys
   * the list page passes to `useApiQuery`.
   */
  invalidateKeys?: string[][];
  /**
   * Optional callback fired after a successful delete (close + any
   * extra cleanup the caller wants). The dialog closes itself first.
   */
  onDeleted?: () => void;
  /** Optional override of the success toast. `false` disables it. */
  successMessage?: string | false;
  /** Confirm-button label. Defaults to "تأكيد الحذف". */
  confirmLabel?: string;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  entity,
  deletePath,
  invalidateKeys,
  onDeleted,
  successMessage = "تم الحذف بنجاح",
  confirmLabel = "تأكيد الحذف",
}: ConfirmDeleteDialogProps) {
  const [impacts, setImpacts] = useState<ImpactItem[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  // Fetch the impact preview whenever the dialog opens for a new entity.
  // Reset any surviving blockers (from a previous aborted delete) on
  // re-open so the dialog starts clean.
  useEffect(() => {
    if (!open || !entity.id) return;
    let cancelled = false;
    setBlockers(null);
    setImpacts([]);
    setLoadingImpact(true);
    apiFetch<{ impacts?: ImpactItem[] }>("/impact-preview", {
      method: "POST",
      body: JSON.stringify({
        entityType: entity.type,
        entityId: entity.id,
        action: "delete",
      }),
    })
      .then((resp) => {
        if (cancelled) return;
        if (resp.impacts && Array.isArray(resp.impacts)) {
          setImpacts(resp.impacts);
        }
      })
      .catch(() => {
        // impact-preview is advisory — if it fails we still let the
        // user proceed with the delete. The real guard is on the
        // server via Phase C.7b delete-guards.
      })
      .finally(() => {
        if (!cancelled) setLoadingImpact(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entity.type, entity.id]);

  const deleteMutation = useApiMutation<void, void>(
    deletePath,
    "DELETE",
    invalidateKeys,
    {
      successMessage,
      // The dialog owns CONFLICT blocker surfacing — suppress the
      // default error toast when we see `meta.blockers`, otherwise
      // the user would get both a toast AND an in-dialog card saying
      // the same thing.
      onCodeError: (code, err) => {
        if (code === "CONFLICT" && Array.isArray(err.meta?.blockers)) {
          const list = (err.meta!.blockers as unknown[])
            .filter((b) => typeof b === "string" && b.length > 0) as string[];
          if (list.length > 0) {
            setBlockers(list);
            return true; // suppress default toast
          }
        }
        return false; // let the default toast fire
      },
      onSuccess: () => {
        onOpenChange(false);
        onDeleted?.();
      },
    },
  );

  const handleConfirm = () => {
    // Clear any stale blockers before attempting again.
    setBlockers(null);
    deleteMutation.mutate(undefined);
  };

  const pending = deleteMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="max-w-lg">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-error-foreground" />
            تأكيد حذف &ldquo;{entity.name}&rdquo;
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1 text-start">
              {loadingImpact ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري فحص البيانات المرتبطة…
                </div>
              ) : impacts.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    سيتأثر بالحذف:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {impacts.map((it, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="shrink-0" aria-hidden>
                          {it.icon}
                        </span>
                        <span className="font-medium text-foreground">
                          {it.label}:
                        </span>
                        <span>{it.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا
                  الإجراء.
                </p>
              )}

              {blockers && blockers.length > 0 && (
                <div className="rounded-md border border-status-error-surface bg-status-error-surface p-3">
                  <p className="text-xs font-semibold text-status-error-foreground">
                    لا يمكن إتمام الحذف — يجب معالجة ما يلي أولاً:
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-status-error-foreground">
                    {blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-status-error-surface0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-start gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={pending || loadingImpact}
            className="gap-1.5"
            rateLimitAware
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                جاري الحذف…
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                {confirmLabel}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            إلغاء
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Re-export the legacy inline card so the few pages that still embed
// the impact preview as an inline row can keep working without being
// refactored in this iteration. New pages should use
// `ConfirmDeleteDialog` (above).
export { DeleteConfirmImpact } from "@/components/delete-confirm-impact";
