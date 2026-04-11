import { useEffect, useCallback } from "react";

interface ShortcutAction {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutAction[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "Enter" && isInput && target.tagName === "INPUT") {
        const form = target.closest("form, [data-form]");
        if (form) {
          const inputs = Array.from(form.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([type="submit"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
          ));
          const currentIndex = inputs.indexOf(target);
          if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
            e.preventDefault();
            inputs[currentIndex + 1].focus();
            return;
          }
        }
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        if (
          shortcut.key !== undefined &&
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch
        ) {
          if ((shortcut.ctrl || shortcut.alt) && isInput) {
            e.preventDefault();
            shortcut.action();
            return;
          }
          if (!isInput) {
            e.preventDefault();
            shortcut.action();
            return;
          }
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export interface ShortcutInfo {
  key: string;
  description: string;
  combo: string;
  category?: string;
}

export function getShortcutsList(): ShortcutInfo[] {
  return [
    { key: "k", description: "لوحة الأوامر الشاملة", combo: "Ctrl+K", category: "عام" },
    { key: "n", description: "إنشاء جديد", combo: "Ctrl+N", category: "عام" },
    { key: "/", description: "عرض قائمة الاختصارات", combo: "Ctrl+/", category: "عام" },
    { key: "e", description: "الموظفين", combo: "Alt+E", category: "الموارد البشرية" },
    { key: "a", description: "الحضور والانصراف", combo: "Alt+A", category: "الموارد البشرية" },
    { key: "l", description: "الإجازات", combo: "Alt+L", category: "الموارد البشرية" },
    { key: "p", description: "الرواتب", combo: "Alt+P", category: "الموارد البشرية" },
    { key: "u", description: "إضافة وحدة عقارية", combo: "Ctrl+Shift+U", category: "الأملاك" },
    { key: "b", description: "إضافة مبنى", combo: "Ctrl+Shift+B", category: "الأملاك" },
    { key: "t", description: "إضافة مستأجر", combo: "Ctrl+Shift+T", category: "الأملاك" },
    { key: "c", description: "إنشاء عقد إيجار", combo: "Ctrl+Shift+C", category: "الأملاك" },
    { key: "m", description: "طلب صيانة جديد", combo: "Ctrl+Shift+M", category: "الأملاك" },
    { key: "p", description: "تسجيل دفعة", combo: "Ctrl+Shift+P", category: "الأملاك" },
  ];
}

export function usePropertyKeyboardShortcuts(navigate: (path: string) => void) {
  const shortcuts: ShortcutAction[] = [
    {
      key: "u",
      ctrl: true,
      shift: true,
      description: "إضافة وحدة عقارية",
      action: () => navigate("/properties/create"),
    },
    {
      key: "b",
      ctrl: true,
      shift: true,
      description: "إضافة مبنى",
      action: () => navigate("/properties/buildings/create"),
    },
    {
      key: "t",
      ctrl: true,
      shift: true,
      description: "إضافة مستأجر",
      action: () => navigate("/properties/tenants/create"),
    },
    {
      key: "c",
      ctrl: true,
      shift: true,
      description: "إنشاء عقد إيجار",
      action: () => navigate("/properties/contracts/create"),
    },
    {
      key: "m",
      ctrl: true,
      shift: true,
      description: "طلب صيانة جديد",
      action: () => navigate("/properties/maintenance/create"),
    },
    {
      key: "p",
      ctrl: true,
      shift: true,
      description: "تسجيل دفعة",
      action: () => navigate("/properties/payments"),
    },
  ];

  useKeyboardShortcuts(shortcuts);
}
