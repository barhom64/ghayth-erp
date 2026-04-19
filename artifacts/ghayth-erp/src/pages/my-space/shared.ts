import { formatTimeAr } from "@/lib/formatters";

export function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return formatTimeAr(iso);
}


export const requestTypeLabels: Record<string, string> = {
  leave: "إجازة",
  salary_advance: "سلفة راتب",
  letter: "خطاب رسمي",
  custody: "عُهدة",
  loan: "سلفة موظف",
  overtime: "وقت إضافي",
  exit: "نهاية خدمة",
};

export const severityColors: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

export const priorityLabels: Record<string, string> = {
  high: "عاجل",
  medium: "متوسط",
  low: "عادي",
  urgent: "طارئ",
};
