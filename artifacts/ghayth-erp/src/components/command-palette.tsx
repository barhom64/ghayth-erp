import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { getAllNavigationPages } from "@/components/layout/sidebar-layout";
import {
  Search, ArrowRight, Users, Clock, Calendar, DollarSign, GraduationCap,
  Plus, UserPlus, ClipboardCheck, QrCode, Command, Keyboard,
  Navigation, X, Loader2, Building2, Car, Home, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

function normalizeArabic(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u200C\u200D\u200E\u200F]/g, "")
    .replace(/^ال/, "")
    .trim();
}

const ARABIC_ALIASES: Record<string, string[]> = {
  "فاتوره": ["فواتير", "فاتور"],
  "فواتير": ["فاتوره", "فاتور"],
  "موظف": ["موظفين", "موظفون", "موظفه"],
  "موظفين": ["موظف", "موظفه"],
  "عميل": ["عملاء", "عميله"],
  "عملاء": ["عميل"],
  "مورد": ["موردين", "موردون"],
  "موردين": ["مورد"],
  "مستاجر": ["مستاجرين", "مستاجرون"],
  "مستاجرين": ["مستاجر"],
  "مالك": ["ملاك", "مالكه"],
  "ملاك": ["مالك"],
  "سياره": ["سيارات", "مركبه", "مركبات"],
  "مركبه": ["مركبات", "سياره", "سيارات"],
  "مركبات": ["مركبه", "سياره", "سيارات"],
  "مشروع": ["مشاريع"],
  "مشاريع": ["مشروع"],
  "مهمه": ["مهام"],
  "مهام": ["مهمه"],
  "اجازه": ["اجازات", "غياب"],
  "اجازات": ["اجازه"],
  "راتب": ["رواتب", "مسير"],
  "رواتب": ["راتب", "مسير"],
  "حساب": ["حسابات", "محاسبه"],
  "حسابات": ["حساب", "محاسبه"],
  "قيد": ["قيود", "يوميه"],
  "قيود": ["قيد", "يوميه"],
  "وحده": ["وحدات", "شقه", "شقق"],
  "وحدات": ["وحده", "شقه", "شقق"],
  "عقد": ["عقود"],
  "عقود": ["عقد"],
  "تذكره": ["تذاكر", "بطاقه"],
  "تذاكر": ["تذكره"],
  "صياده": ["صيانه", "اصلاح"],
  "صيانه": ["اصلاح"],
  "مخالفه": ["مخالفات", "عقوبه", "عقوبات"],
  "مخالفات": ["مخالفه", "عقوبه", "عقوبات"],
  "عذر": ["اعذار", "عذور", "استئذان"],
  "اعذار": ["عذر", "استئذان"],
  "حضور": ["انصراف", "دوام"],
  "انصراف": ["حضور", "دوام"],
  "بحث": ["search", "find"],
};

function expandQueryAliases(normalizedQuery: string): string[] {
  const terms = new Set<string>([normalizedQuery]);
  for (const [key, aliases] of Object.entries(ARABIC_ALIASES)) {
    if (normalizedQuery.includes(key) || aliases.some(a => normalizedQuery.includes(a))) {
      terms.add(key);
      aliases.forEach(a => terms.add(a));
    }
  }
  return Array.from(terms);
}

interface CommandItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: any;
  iconColor?: string;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  initialFilter?: "shortcuts" | null;
}

const ENTITY_ICON_MAP: Record<string, any> = {
  "موظفين": Users,
  "عملاء": Building2,
  "مركبات": Car,
  "وحدات عقارية": Home,
  "تذاكر دعم": Headphones,
};
const ENTITY_COLOR_MAP: Record<string, string> = {
  "موظفين": "text-blue-600 bg-blue-50",
  "عملاء": "text-green-600 bg-green-50",
  "مركبات": "text-purple-600 bg-purple-50",
  "وحدات عقارية": "text-emerald-600 bg-emerald-50",
  "تذاكر دعم": "text-red-600 bg-red-50",
};

export function CommandPalette({ open, onClose, initialFilter }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiResults, setApiResults] = useState<CommandItem[]>([]);
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"shortcuts" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const navPages = useMemo(() => getAllNavigationPages(), []);

  const quickActions: CommandItem[] = useMemo(() => [
    {
      id: "add-employee",
      label: "إضافة موظف جديد",
      icon: UserPlus,
      iconColor: "text-blue-600 bg-blue-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/employees/create"); onClose(); },
      keywords: ["موظف", "تعيين", "جديد", "إضافة"],
    },
    {
      id: "request-leave",
      label: "طلب إجازة",
      icon: Calendar,
      iconColor: "text-emerald-600 bg-emerald-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/hr/leaves/create"); onClose(); },
      keywords: ["إجازة", "طلب", "غياب"],
    },
    {
      id: "check-in",
      label: "تسجيل حضور بالرمز المصوّر",
      icon: QrCode,
      iconColor: "text-purple-600 bg-purple-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/hr/attendance/qr-scanner"); onClose(); },
      keywords: ["حضور", "رمز مصور", "تسجيل"],
    },
    {
      id: "run-payroll",
      label: "تشغيل مسير الرواتب",
      icon: DollarSign,
      iconColor: "text-orange-600 bg-orange-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/hr/payroll"); onClose(); },
      keywords: ["رواتب", "مسير", "مرتبات"],
    },
    {
      id: "new-request",
      label: "تقديم طلب جديد",
      icon: Plus,
      iconColor: "text-indigo-600 bg-indigo-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/requests?action=new"); onClose(); },
      keywords: ["طلب", "جديد"],
    },
    {
      id: "new-training",
      label: "إضافة برنامج تدريبي",
      icon: GraduationCap,
      iconColor: "text-teal-600 bg-teal-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/hr/training"); onClose(); },
      keywords: ["تدريب", "برنامج"],
    },
    {
      id: "approve-leaves",
      label: "اعتماد طلبات الإجازة",
      icon: ClipboardCheck,
      iconColor: "text-green-600 bg-green-50",
      category: "إجراءات سريعة",
      action: () => { navigate("/hr/leaves?tab=pending"); onClose(); },
      keywords: ["اعتماد", "موافقة", "إجازات"],
    },
  ], [navigate]);

  const shortcuts: CommandItem[] = useMemo(() => [
    { id: "sh-employees", label: "الموظفين", subtitle: "Alt+E", icon: Users, iconColor: "text-blue-500 bg-blue-50", category: "اختصارات لوحة المفاتيح", action: () => { navigate("/employees"); onClose(); }, keywords: ["اختصار", "موظفين"] },
    { id: "sh-attendance", label: "الحضور والانصراف", subtitle: "Alt+A", icon: Clock, iconColor: "text-purple-500 bg-purple-50", category: "اختصارات لوحة المفاتيح", action: () => { navigate("/hr/attendance"); onClose(); }, keywords: ["اختصار", "حضور"] },
    { id: "sh-leaves", label: "الإجازات", subtitle: "Alt+L", icon: Calendar, iconColor: "text-emerald-500 bg-emerald-50", category: "اختصارات لوحة المفاتيح", action: () => { navigate("/hr/leaves"); onClose(); }, keywords: ["اختصار", "إجازات"] },
    { id: "sh-payroll", label: "الرواتب", subtitle: "Alt+P", icon: DollarSign, iconColor: "text-orange-500 bg-orange-50", category: "اختصارات لوحة المفاتيح", action: () => { navigate("/hr/payroll"); onClose(); }, keywords: ["اختصار", "رواتب"] },
    { id: "sh-help", label: "لوحة الأوامر", subtitle: "Ctrl+K", icon: Keyboard, iconColor: "text-gray-500 bg-gray-50", category: "اختصارات لوحة المفاتيح", action: () => {}, keywords: ["اختصار", "مساعدة"] },
  ], [navigate]);

  const pageItems: CommandItem[] = useMemo(() => {
    return navPages
      .filter(p => !p.path.startsWith("#"))
      .map(p => ({
        id: `page-${p.path}`,
        label: p.label,
        subtitle: p.parent ? `${p.parent} ← ${p.section}` : p.section,
        icon: Navigation,
        iconColor: "text-sky-600 bg-sky-50",
        category: "صفحات النظام",
        action: () => { navigate(p.path); onClose(); },
        keywords: [p.label, p.section, p.parent || ""].filter(Boolean),
      }));
  }, [navPages, navigate]);

  const staticItems = useMemo(() => [...quickActions, ...shortcuts, ...pageItems], [quickActions, shortcuts, pageItems]);

  const filteredStatic = useMemo(() => {
    if (activeFilter === "shortcuts" && !query.trim()) {
      return shortcuts;
    }
    if (!query.trim()) {
      return [...quickActions, ...shortcuts, ...pageItems];
    }
    const q = normalizeArabic(query);
    const source = activeFilter === "shortcuts" ? shortcuts : staticItems;
    const expanded = expandQueryAliases(q);
    return source.filter(item => {
      const haystack = [
        item.label,
        item.subtitle || "",
        ...(item.keywords || []),
      ].map(normalizeArabic).join(" | ");
      return expanded.some(term => haystack.includes(term));
    });
  }, [query, staticItems, quickActions, shortcuts, pageItems, activeFilter]);

  const allFiltered = useMemo(() => [...filteredStatic, ...apiResults], [filteredStatic, apiResults]);

  const CATEGORY_ORDER = ["إجراءات سريعة", "اختصارات لوحة المفاتيح", "صفحات النظام", "نتائج البحث"];

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of allFiltered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    const ordered: Record<string, CommandItem[]> = {};
    for (const cat of CATEGORY_ORDER) {
      if (groups[cat]) ordered[cat] = groups[cat];
    }
    for (const cat of Object.keys(groups)) {
      if (!ordered[cat]) ordered[cat] = groups[cat];
    }
    return ordered;
  }, [allFiltered]);

  useEffect(() => {
    if (!open) return;
    if (!query || query.length < 2) {
      setApiResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoadingApi(true);
      try {
        const data = await apiFetch<{ results: any[] }>(`/search?q=${encodeURIComponent(query)}`);
        const items: CommandItem[] = (data.results || []).slice(0, 12).map((r: any, i: number) => {
          const Icon = ENTITY_ICON_MAP[r.category] || Users;
          const color = ENTITY_COLOR_MAP[r.category] || "text-gray-600 bg-gray-50";
          return {
            id: `api-${i}-${r.category}`,
            label: r.name || r.title || r.ref || "—",
            subtitle: r.category + (r.jobTitle ? ` · ${r.jobTitle}` : r.status ? ` · ${r.status}` : ""),
            icon: Icon,
            iconColor: color,
            category: r.category,
            action: () => { if (r.link) { navigate(r.link); } onClose(); },
          };
        });
        setApiResults(items);
      } catch {
        setApiResults([]);
      } finally {
        setIsLoadingApi(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, navigate]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setApiResults([]);
      setActiveFilter(initialFilter || null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialFilter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, allFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allFiltered[selectedIndex]) {
        allFiltered[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [allFiltered, selectedIndex, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, onClose]);

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" dir="rtl">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ابحث في الصفحات، الموظفين، والإجراءات..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
          />
          {isLoadingApi && <Loader2 className="h-4 w-4 text-gray-400 animate-spin shrink-0" />}
          {query && !isLoadingApi && (
            <button onClick={() => { setQuery(""); setApiResults([]); }} className="shrink-0">
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 shrink-0 px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200">إغلاق</kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1 py-1">
          {allFiltered.length === 0 ? (
            query ? (
              <div className="py-10 text-center text-sm text-gray-400">
                لا توجد نتائج لـ "{query}"
              </div>
            ) : null
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white/95 backdrop-blur-sm">
                  {category}
                </div>
                {items.map(item => {
                  const idx = globalIdx++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-right transition-colors",
                        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.iconColor)}>
                        <item.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                        {item.subtitle && (
                          <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200">↑↓</kbd> للتنقل
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200">إدخال</kbd> للفتح
          </span>
          <span className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200">ك</kbd> لوحة الأوامر
          </span>
        </div>
      </div>
    </div>
  );
}
