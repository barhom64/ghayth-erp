import { useState, type ReactNode } from "react";
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

/**
 * useDirtyGuard — RTL-friendly replacement for the synchronous
 * `window.confirm("…تغييرات…")` pattern that used to live inside
 * Dialog `onOpenChange` handlers.
 *
 * Drop the returned `guardedClose` into a Dialog's `onOpenChange`, and
 * render `discardDialog` as a sibling. When the form inside the Dialog
 * reports `isDirty=true`, a close attempt instead opens an AlertDialog
 * asking the user to discard or keep editing. The AlertDialog inherits
 * the rest of the app's RTL + dark-mode styling, unlike the OS-default
 * confirm modal that was here before the 2026-05-25 sweep.
 *
 * Typical wiring inside a Dialog that hosts a FormShell:
 *
 *   const [isDirty, setIsDirty] = useState(false);
 *   const { guardedClose, discardDialog } = useDirtyGuard(isDirty, onOpenChange);
 *
 *   return (
 *     <>
 *       <Dialog open={open} onOpenChange={guardedClose}>
 *         <DialogContent>
 *           <FormShell ...>
 *             <DirtyTracker onChange={setIsDirty} />
 *             ...
 *           </FormShell>
 *         </DialogContent>
 *       </Dialog>
 *       {discardDialog}
 *     </>
 *   );
 *
 * The hook is intentionally agnostic about *how* isDirty is computed —
 * pass a react-hook-form `formState.isDirty`, a custom comparison, or
 * any boolean. fiscal-periods-v2 uses a small DirtyTracker component
 * that reads from `useFormContext().formState.isDirty`; other pages
 * can do the same or skip it entirely.
 *
 * Sibling hook: `useUnsavedChanges` handles the browser-level
 * `beforeunload` guard for full-page navigation. Use both together if
 * a form is mounted inside a long-lived Dialog AND the page itself
 * shouldn't be reloaded while dirty.
 */
export function useDirtyGuard(
  isDirty: boolean,
  onClose: (open: boolean) => void,
): {
  guardedClose: (open: boolean) => void;
  discardDialog: ReactNode;
} {
  const [showDiscard, setShowDiscard] = useState(false);
  const guardedClose = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscard(true);
      return;
    }
    onClose(next);
  };
  const discardDialog = (
    <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle>تغييرات لم تُحفظ</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد المغادرة وتجاهل التعديلات؟
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-start gap-2">
          <AlertDialogAction
            onClick={() => {
              setShowDiscard(false);
              onClose(false);
            }}
          >
            تجاهل التغييرات
          </AlertDialogAction>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { guardedClose, discardDialog };
}
