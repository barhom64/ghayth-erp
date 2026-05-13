import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Search, Users, Building2, FileText, FolderKanban, Headphones, X, Loader2, Car, Home, CloudRain, CreditCard, ScrollText, Navigation, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getStatusColor, STATUSES } from "@/lib/constants";
import { getAllNavigationPages } from "@/components/layout/sidebar-layout";

const CATEGORY_ICONS: Record<string, any> = {
  "موظفين": Users,
  "عملاء": Building2,
  "فواتير": CreditCard,
  "مشاريع": FolderKanban,
  "تذاكر دعم": Headphones,
  "وحدات عقارية": Home,
  "مباني عقارية": Building2,
  "مستأجرون": Users2,
  "مركبات": Car,
  "معتمرين": CloudRain,
  "عقود": ScrollText,
  "صفحات وميزات": Navigation,
};

const CATEGORY_COLORS: Record<string, string> = {
  "موظفين": "text-status-info-foreground bg-status-info-surface",
  "عملاء": "text-status-success-foreground bg-status-success-surface",
  "فواتير": "text-indigo-600 bg-indigo-50",
  "مشاريع": "text-orange-600 bg-orange-50",
  "تذاكر دعم": "text-status-error-foreground bg-status-error-surface",
  "وحدات عقارية": "text-emerald-600 bg-emerald-50",
  "مباني عقارية": "text-slate-600 bg-slate-50",
  "مستأجرون": "text-violet-600 bg-violet-50",
  "مركبات": "text-purple-600 bg-purple-50",
  "معتمرين": "text-teal-600 bg-teal-50",
  "عقود": "text-cyan-600 bg-cyan-50",
  "صفحات وميزات": "text-sky-600 bg-sky-50",
};

const ENTITY_TABS = [
  { key: "all", label: "الكل" },
  { key: "pages", label: "صفحات" },
  { key: "employees", label: "موظفين" },
  { key: "clients", label: "عملاء" },
  { key: "units", label: "وحدات" },
  { key: "buildings", label: "مباني" },
  { key: "tenants", label: "مستأجرون" },
  { key: "vehicles", label: "مركبات" },
  { key: "pilgrims", label: "معتمرين" },
  { key: "invoices", label: "فواتير" },
  { key: "contracts", label: "عقود" },
];

export function GlobalSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const navPages = useMemo(() => getAllNavigationPages(), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchNavPages = (q: string): any[] => {
    if (!q || q.length < 1) return [];
    const lower = q.toLowerCase();
    return navPages
      .filter(p => p.label.toLowerCase().includes(lower) || (p.parent && p.parent.toLowerCase().includes(lower)))
      .slice(0, 8)
      .map(p => ({
        name: p.label,
        category: "صفحات وميزات",
        link: p.path,
        subtitle: p.parent ? `${p.parent} ← ${p.section}` : p.section,
        isNavPage: true,
      }));
  };

  const doSearch = (q: string, tab: string) => {
    if (!q || q.length < 2) {
      if (q && q.length >= 1) {
        const navResults = searchNavPages(q);
        if (navResults.length > 0) {
          setResults(navResults);
          setIsOpen(true);
          return;
        }
      }
      setResults([]);
      setIsOpen(false);
      return;
    }

    const navResults = searchNavPages(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const typeParam = tab !== "all" && tab !== "pages" ? `&type=${tab}` : "";
        if (tab === "pages") {
          setResults(navResults);
          setIsOpen(true);
          setIsLoading(false);
          return;
        }
        const data = await apiFetch<{ results: any[] }>(`/search?q=${encodeURIComponent(q)}${typeParam}`);
        const apiResults = data.results || [];
        setResults([...navResults, ...apiResults]);
        setIsOpen(true);
      } catch {
        setResults(navResults);
        setIsOpen(navResults.length > 0);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  useEffect(() => {
    doSearch(query, activeTab);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeTab]);

  const handleSelect = (item: any) => {
    setIsOpen(false);
    setQuery("");
    if (item.link) navigate(item.link);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const grouped = results.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const getSubtitle = (item: any) => {
    if (item.isNavPage && item.subtitle) return item.subtitle;
    const parts: string[] = [];
    if (item.empNumber) parts.push(item.empNumber);
    if (item.jobTitle) parts.push(item.jobTitle);
    if (item.phone) parts.push(item.phone);
    if (item.email) parts.push(item.email);
    if (item.passportNumber) parts.push(`جواز: ${item.passportNumber}`);
    if (item.plateNumber) parts.push(`لوحة: ${item.plateNumber}`);
    if (item.clientName) parts.push(item.clientName);
    if (item.buildingName) parts.push(item.buildingName);
    if (item.nationality) parts.push(item.nationality);
    if (item.ref) parts.push(item.ref);
    if (item.tenantName) parts.push(`مستأجر: ${item.tenantName}`);
    if (item.unitNumber) parts.push(`وحدة: ${item.unitNumber}`);
    if (item.contractNumber) parts.push(item.contractNumber);
    if (item.status) parts.push(item.status);
    return parts.slice(0, 2).join(" · ");
  };

  return (
    <div ref={containerRef} className="relative" data-global-search>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="بحث في الصفحات والموظفين والعملاء..."
          className="w-full sm:w-72 h-9 ps-9 pe-8 text-sm border border-border rounded-lg bg-surface-subtle focus:bg-white focus:border-status-info-surface focus:ring-1 focus:ring-blue-200 outline-none transition-all"
        />
        {isLoading && <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />}
        {query && !isLoading && (
          <button
            onClick={() => { setQuery(""); setResults([]); setIsOpen(false); setActiveTab("all"); }}
            className="absolute end-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-muted-foreground" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 start-0 end-0 sm:start-auto sm:end-auto sm:w-[420px] bg-white rounded-xl shadow-xl border border-border z-50 max-h-[480px] overflow-hidden flex flex-col">
          <div className="flex gap-1 px-2 pt-2 pb-1 border-b overflow-x-auto shrink-0">
            {ENTITY_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-gray-100"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex-1">
            {results.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا توجد نتائج لـ "{query}"
              </div>
            ) : (
              <div className="py-1">
                {Object.entries(grouped).sort(([a], [b]) => {
                  if (a === "صفحات وميزات") return -1;
                  if (b === "صفحات وميزات") return 1;
                  return 0;
                }).map(([category, items]) => {
                  const Icon = CATEGORY_ICONS[category] || Search;
                  const colorClass = CATEGORY_COLORS[category] || "text-muted-foreground bg-surface-subtle";
                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-2 sticky top-0 bg-white">
                        <div className={cn("w-5 h-5 rounded flex items-center justify-center", colorClass)}>
                          <Icon className="w-3 h-3" />
                        </div>
                        {category}
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">{(items as any[]).length}</Badge>
                      </div>
                      {(items as any[]).map((item: any, idx: number) => (
                        <button
                          key={`${category}-${idx}`}
                          onClick={() => handleSelect(item)}
                          className="w-full text-right px-4 py-2 hover:bg-surface-subtle flex items-center gap-3 transition-colors"
                        >
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", colorClass)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.name || item.title || item.ref || "-"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {getSubtitle(item)}
                            </p>
                          </div>
                          {item.status && (
                            <Badge className={cn("text-[10px] shrink-0 font-normal", getStatusColor(item.status))} variant="outline">
                              {STATUSES[item.status] || item.status}
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground text-center shrink-0">
            {results.length} نتيجة — اضغط Ctrl+K للبحث السريع
          </div>
        </div>
      )}
    </div>
  );
}
