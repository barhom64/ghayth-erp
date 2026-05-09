import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError, apiFetch, getErrorMessage } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { actionLabel } from "@/lib/action-labels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * useLifecycleAction — P1.5 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The server's `applyTransition` helper (src/lib/lifecycleEngine.ts) expects
 * callers to POST to `/:entity/:id/:action` — e.g. `/hr/leave-requests/42/approve`.
 * Today each page that wants to approve / reject / cancel an entity rolls
 * its own fetch + toast + invalidate dance, which is why we have ~60 copies
 * of the same handler across the tree.
 *
 * This hook is the single way to drive a lifecycle transition from the UI.
 * Given an entity + id + base path, it exposes a typed set of actions
 * that:
 *
 *   1. Call the matching POST endpoint
 *   2. Surface VALIDATION / CONFLICT / FORBIDDEN errors through the P1.3
 *      toast-by-code helper
 *   3. Ask for a reason when the server requires one (409 → reason prompt)
 *   4. Invalidate the provided React-Query keys so lists / detail pages
 *      refresh without a manual dispatch
 *
 * Usage:
 *
 *   const leave = useLifecycleAction({
 *     basePath: "/hr/leave-requests",
 *     id: leaveId,
 *     invalidateKeys: [["hr-leaves"], ["hr-leave", leaveId]],
 *   });
 *
 *   <Button onClick={() => leave.run("approve")}>موافقة</Button>
 *   <Button onClick={() => leave.run("reject", { requireReason: true })}>
 *     رفض
 *   </Button>
 *   <Button disabled={leave.pending}>...</Button>
 *
 * Callers never have to import `applyTransition` or know about
 * `lifecycleErrorResponse` — the hook handles both ends.
 */

export interface LifecycleActionOptions {
  /** Base path of the entity, e.g. "/hr/leave-requests". No trailing slash. */
  basePath: string;
  /** Primary key of the row the action targets. */
  id: number | string;
  /** React-Query keys to invalidate on success. */
  invalidateKeys?: readonly (readonly (string | number)[])[];
  /**
   * Pretty label for toasts. When set, success toast becomes
   * "تم {label}" instead of a generic "تم تنفيذ العملية".
   */
  entityLabel?: string;
  /**
   * Called on any successful action, with the action name and the server
   * response body. Use for local state updates that shouldn't wait for
   * React-Query refetch.
   */
  onSuccess?: (action: string, data: unknown) => void;
  /**
   * Called on any error. Return `true` to suppress the default toast.
   */
  onError?: (action: string, error: Error) => boolean | void;
}

export interface RunOptions {
  /**
   * When true, opens an AlertDialog asking the user for a reason before
   * calling the endpoint. The reason is sent as `{ reason }` in the body.
   * Use for reject / cancel / return transitions where the server requires
   * a justification.
   */
  requireReason?: boolean;
  /** Extra body fields merged into the POST. */
  body?: Record<string, unknown>;
  /** Dialog title when `requireReason` is true. Defaults to "السبب مطلوب". */
  reasonTitle?: string;
  /**
   * Dialog body text when `requireReason` is true.
   * Defaults to "يرجى إدخال السبب لإكمال العملية:".
   */
  reasonPrompt?: string;
  /** Override the success toast title for this specific action. */
  successMessage?: string;
}

/**
 * Internal state describing whether the reason-prompt dialog should be open.
 * The hook exposes `reasonDialog` (JSX) so callers just drop it into their
 * tree once and the dialog manages its own state.
 */
interface ReasonDialogState {
  open: boolean;
  title: string;
  prompt: string;
  /** Resolves with the entered reason, or null when the user cancels. */
  resolve: ((value: string | null) => void) | null;
}

export interface LifecycleHandle {
  /** Invoke a transition — e.g. run("approve") or run("reject", { requireReason: true }). */
  run: (action: string, options?: RunOptions) => Promise<unknown>;
  /** True while a transition is in flight. Use to disable buttons. */
  pending: boolean;
  /** The last error (if any) — cleared on the next successful run. */
  lastError: Error | null;
  /**
   * JSX node that renders the reason-prompt dialog. Drop it into the page
   * once (anywhere — it's positioned via portal) and `run("reject", { requireReason: true })`
   * will open it automatically.
   */
  reasonDialog: React.ReactNode;
}

export function useLifecycleAction(
  options: LifecycleActionOptions,
): LifecycleHandle {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [reasonState, setReasonState] = useState<ReasonDialogState>({
    open: false,
    title: "السبب مطلوب",
    prompt: "يرجى إدخال السبب لإكمال العملية:",
    resolve: null,
  });
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  const askReason = (title: string, prompt: string): Promise<string | null> =>
    new Promise<string | null>((resolve) => {
      setReasonState({ open: true, title, prompt, resolve });
    });

  const closeReason = (value: string | null) => {
    setReasonState((prev) => {
      prev.resolve?.(value);
      return { ...prev, open: false, resolve: null };
    });
  };

  const run = async (action: string, runOptions: RunOptions = {}): Promise<unknown> => {
    if (pending) return;

    let reason: string | undefined;
    if (runOptions.requireReason) {
      const answer = await askReason(
        runOptions.reasonTitle ?? "السبب مطلوب",
        runOptions.reasonPrompt ?? "يرجى إدخال السبب لإكمال العملية:",
      );
      if (answer === null) return; // user cancelled
      if (!answer.trim()) {
        toast({
          title: "السبب مطلوب",
          description: "يجب إدخال سبب لتنفيذ هذه العملية.",
          variant: "destructive",
        });
        return;
      }
      reason = answer.trim();
    }

    setPending(true);
    setLastError(null);
    try {
      const data = await apiFetch(
        `${options.basePath}/${options.id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(reason !== undefined ? { reason } : {}),
            ...(runOptions.body ?? {}),
          }),
        },
      );

      options.invalidateKeys?.forEach((key) =>
        qc.invalidateQueries({ queryKey: [...key] }),
      );

      const verb = actionLabel(action) || "تنفيذ";
      const successTitle =
        runOptions.successMessage ??
        (options.entityLabel
          ? `تم ${verb} ${options.entityLabel}`
          : `تم ${verb}`);
      toast({ title: successTitle });

      options.onSuccess?.(action, data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setLastError(error);

      const suppressed = options.onError?.(action, error);
      if (suppressed === true) return;

      if (err instanceof ApiError) {
        toast({
          title: titleForCode(err.code, action),
          description: err.fix ?? err.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "تعذّر تنفيذ العملية",
          description: getErrorMessage(err),
          variant: "destructive",
        });
      }
      throw err;
    } finally {
      setPending(false);
    }
  };

  const reasonDialog = (
    <AlertDialog
      open={reasonState.open}
      onOpenChange={(open) => {
        if (!open) closeReason(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{reasonState.title}</AlertDialogTitle>
          <AlertDialogDescription>{reasonState.prompt}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          ref={reasonInputRef}
          autoFocus
          rows={3}
          placeholder="اكتب السبب هنا..."
          dir="rtl"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => closeReason(null)}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => closeReason(reasonInputRef.current?.value ?? "")}
          >
            تأكيد
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { run, pending, lastError, reasonDialog };
}

/**
 * Compose a toast title from error code + attempted action so users see
 * "لا يمكن اعتماد" instead of the generic "تعذّر تنفيذ العملية". Verbs
 * come from the canonical `lib/action-labels` so the wording matches
 * audit logs and approval timelines elsewhere in the app.
 */
function titleForCode(code: string, action: string): string {
  const verb = actionLabel(action) || "تنفيذ";
  switch (code) {
    case "CONFLICT":
      return `لا يمكن ${verb} في الحالة الحالية`;
    case "FORBIDDEN":
      return `غير مصرح بـ${verb}`;
    case "NOT_FOUND":
      return "السجل غير موجود";
    case "VALIDATION_ERROR":
      return "البيانات غير صالحة";
    case "INTEGRATION_ERROR":
      return "خدمة خارجية متعطّلة";
    default:
      return `تعذّر ${verb}`;
  }
}
