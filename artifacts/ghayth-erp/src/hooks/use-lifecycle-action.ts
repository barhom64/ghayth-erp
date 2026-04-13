import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetch, getErrorMessage } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

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
   * When true, prompts the user for a reason via `window.prompt` before
   * calling the endpoint. The reason is sent as `{ reason }` in the body.
   * Use for reject / cancel / return transitions where the server requires
   * a justification.
   */
  requireReason?: boolean;
  /** Extra body fields merged into the POST. */
  body?: Record<string, unknown>;
  /** Prompt text when `requireReason` is true. */
  reasonPrompt?: string;
  /** Override the success toast title for this specific action. */
  successMessage?: string;
}

export interface LifecycleHandle {
  /** Invoke a transition — e.g. run("approve") or run("reject", { requireReason: true }). */
  run: (action: string, options?: RunOptions) => Promise<unknown>;
  /** True while a transition is in flight. Use to disable buttons. */
  pending: boolean;
  /** The last error (if any) — cleared on the next successful run. */
  lastError: Error | null;
}

export function useLifecycleAction(
  options: LifecycleActionOptions,
): LifecycleHandle {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const run = async (action: string, runOptions: RunOptions = {}): Promise<unknown> => {
    if (pending) return;

    let reason: string | undefined;
    if (runOptions.requireReason) {
      const promptText =
        runOptions.reasonPrompt ?? "يرجى إدخال السبب:";
      const answer = window.prompt(promptText);
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

      const successTitle =
        runOptions.successMessage ??
        (options.entityLabel
          ? `تم ${arabicActionLabel(action)} ${options.entityLabel}`
          : `تم ${arabicActionLabel(action)}`);
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

  return { run, pending, lastError };
}

/**
 * Map a lifecycle action verb to its Arabic past-tense phrase for success
 * toasts. Unknown verbs fall back to "تنفيذ العملية".
 */
function arabicActionLabel(action: string): string {
  switch (action) {
    case "approve":
      return "اعتماد";
    case "reject":
      return "رفض";
    case "cancel":
      return "إلغاء";
    case "return":
      return "إرجاع";
    case "send":
      return "إرسال";
    case "close":
      return "إقفال";
    case "complete":
      return "إكمال";
    case "terminate":
      return "إنهاء";
    case "renew":
      return "تجديد";
    case "reopen":
      return "إعادة فتح";
    case "submit":
      return "تقديم";
    case "archive":
      return "أرشفة";
    default:
      return "تنفيذ";
  }
}

/**
 * Compose a toast title from error code + attempted action so users see
 * "لا يمكن اعتماد" instead of the generic "تعذّر تنفيذ العملية".
 */
function titleForCode(code: string, action: string): string {
  const verb = arabicActionLabel(action);
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
