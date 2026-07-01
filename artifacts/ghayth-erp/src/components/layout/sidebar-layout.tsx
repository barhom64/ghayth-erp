import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { GhaythLogo } from "@/components/shared/ghayth-logo";
import { useAppContext, roleKeyColors, ModuleType } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import {
  LayoutDashboard, Users, Building2, CreditCard, FileText, Truck, Home, Banknote,
  Shield, ChevronDown, ChevronLeft, Clock, Calendar, DollarSign, GraduationCap,
  Paperclip,
  Target, Network, Receipt, Wallet, Car, Wrench, Fuel, User,
  FileCheck, AlertTriangle, ClipboardCheck, Building, FileSignature, Users2,
  Hammer, TrendingUp, FileBarChart, FolderOpen, Archive, ListTodo, GitBranch,
  FilePlus, CalendarClock, ScrollText, Cog, Bell, Mail,
  MessageSquare, Scale, Briefcase, Megaphone, ShoppingCart, Package, Activity,
  LineChart, Menu, X, LogOut, Headphones, CheckCircle,
  KeyRound, CloudRain, MapPin, QrCode, FileSignature as FileSignature2,
  BarChart3, UserPlus, ClipboardList, Navigation, Percent, Zap,
  Sparkles, Brain, Search, ArrowLeftRight,
  Plus, Printer, CheckSquare, Download, Send, Star, Settings, BookOpen, Radar, Timer, ListChecks,
  BarChart2, ShieldAlert, Flag, Lock, Layers, Calculator, LayoutGrid,
  RefreshCw, Globe, TrendingDown as TrendingDown2,
  Satellite, Bot, HardDrive, Video as VideoIcon, Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { apiFetch, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { PolicyBanner } from "@/components/policy-banner";
import { RateLimitFallbackBanner } from "@/components/rate-limit-fallback-banner";
import { useKeyboardShortcuts, usePropertyKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { isRegisteredRoute } from "@/routes/registry";
// CommandPalette is only mounted when the user opens it (Cmd+K or the
// header button). Lazy-load it so its ~345 lines + icons don't ship in
// the initial bundle.
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({ default: m.CommandPalette }))
);

import {
  allNavSections,
  type NavItem,
  type NavSection,
} from "@/components/layout/navigation.registry";

const allNavItems: NavItem[] = allNavSections.flatMap(s => s.items);

export function getAllNavigationPages(): { label: string; path: string; section: string; parent?: string; icon?: any; module?: ModuleType; minRoleLevel?: number; perm?: string | string[]; permMode?: "all" | "any" }[] {
  const pages: { label: string; path: string; section: string; parent?: string; icon?: any; module?: ModuleType; minRoleLevel?: number; perm?: string | string[]; permMode?: "all" | "any" }[] = [];

  function collectPages(items: NavItem[], section: string, parentLabel?: string, inheritedRoleLevel?: number) {
    for (const item of items) {
      const effectiveRoleLevel = item.minRoleLevel ?? inheritedRoleLevel;
      if (!item.path.startsWith("#")) {
        pages.push({
          label: item.label,
          path: item.path,
          section,
          parent: parentLabel,
          icon: item.icon,
          module: item.module,
          minRoleLevel: effectiveRoleLevel,
          perm: item.perm,
          permMode: item.permMode,
        });
      }
      if (item.children) {
        collectPages(item.children, section, parentLabel ? `${parentLabel} / ${item.label}` : item.label, effectiveRoleLevel);
      }
    }
  }

  for (const section of allNavSections) {
    collectPages(section.items, section.title);
  }
  return pages;
}

/**
 * useFilteredNavSections — exposes the same filter pipeline the sidebar
 * uses (role-level, module access, feature flags, sub-page gates,
 * fine-grained perms, route-registry check) as a reusable hook. Returns
 * the navigation tree pre-filtered for the current user. Consumed by
 * sidebar-layout itself AND by the /services hub page so both stay in
 * sync without duplicating the filter logic.
 */
export function useFilteredNavSections(): NavSection[] {
  const {
    canAccessModule,
    canAccessSubPage,
    isFeatureEnabled,
    can,
    effectiveRoleLevel,
  } = useAppContext();

  const itemPermAllowed = (item: NavItem): boolean => {
    if (!item.perm) return true;
    const list = Array.isArray(item.perm) ? item.perm : [item.perm];
    return item.permMode === "any" ? list.some(can) : list.every(can);
  };

  const filterItems = (items: NavItem[], parentModule?: ModuleType): NavItem[] =>
    items
      .map((item): NavItem | null => {
        const mod = item.module ?? parentModule;
        if (item.module && !canAccessModule(item.module)) return null;
        if (item.module && !isFeatureEnabled(item.module)) return null;
        if (item.minRoleLevel && effectiveRoleLevel < item.minRoleLevel) return null;
        if (item.subKey && mod && !canAccessSubPage(mod, item.subKey)) return null;
        if (!itemPermAllowed(item)) return null;
        if (!item.children || item.children.length === 0) {
          if (!isRegisteredRoute(item.path)) return null;
          return item;
        }
        const filteredChildren = filterItems(item.children, mod);
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      })
      .filter((x): x is NavItem => x !== null);

  return allNavSections
    .map((section) => ({
      ...section,
      items: filterItems(section.items),
    }))
    .filter((section) => section.items.length > 0);
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { logout, user } = useAuth();
  const {
    selectedRole,
    setSelectedRoleKey,
    userRoles,
    selectedRoleLabel,
    selectedRoleColor,
    jobTitle,
    companies,
    selectedCompanyIds,
    setSelectedCompanyIds,
    selectedBranchIds,
    setSelectedBranchIds,
    filteredBranches,
    canAccessModule,
    canAccessSubPage,
    isFeatureEnabled,
    can,
    roleLevel,
    effectiveRoleLevel,
    switchToCompany,
  } = useAppContext();
  const { settings: globalSettings } = useSettings();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteFilter, setCommandPaletteFilter] = useState<"shortcuts" | null>(null);

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      description: "لوحة الأوامر",
      action: () => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); },
    },
    {
      key: "n",
      ctrl: true,
      description: "طلب جديد",
      action: () => navigate("/requests"),
    },
    {
      key: "e",
      alt: true,
      description: "الموظفين",
      action: () => navigate("/employees"),
    },
    {
      key: "a",
      alt: true,
      description: "الحضور والانصراف",
      action: () => navigate("/hr/attendance"),
    },
    {
      key: "l",
      alt: true,
      description: "الإجازات",
      action: () => navigate("/hr/leaves"),
    },
    {
      key: "p",
      alt: true,
      description: "الرواتب",
      action: () => navigate("/hr/payroll"),
    },
    {
      key: "/",
      ctrl: true,
      description: "عرض قائمة الاختصارات",
      action: () => { setCommandPaletteFilter("shortcuts"); setCommandPaletteOpen(true); },
    },
    {
      key: "b",
      ctrl: true,
      description: "طي/توسيع القائمة الجانبية",
      action: () => setIsSidebarCollapsed(prev => !prev),
    },
  ]);

  usePropertyKeyboardShortcuts(navigate);

  // filterItems / filteredSections were inlined here pre-2026-05-30. They
  // moved to the exported `useFilteredNavSections` hook so the /services
  // hub page can reuse the same pipeline without copy-pasting the rule
  // set. The hook re-reads useAppContext() internally — same context,
  // same answers, single source of truth.
  const filteredSections = useFilteredNavSections();

  const filteredNavItems = filteredSections.flatMap(s => s.items);

  // Tree-structure ancestor / descendant map for the accordion. Pre-2026-06 the
  // accordion used URL-prefix matching to decide "is A an ancestor of B?", which
  // broke whenever a parent's path wasn't a prefix of its child's path — e.g.
  // الأسطول → /fleet had a sub-entry «اللوحات والسائق» → /module-dashboards?tab=fleet.
  // Clicking the sub-entry computed "no ancestors" and collapsed /fleet, hiding
  // the very entry that was just clicked, so visually nothing opened. The maps
  // below are built from the actual nav tree, so structural parents stay open
  // regardless of how their URLs are shaped.
  const { ancestorsByPath, descendantsByPath } = React.useMemo(() => {
    const ancestors = new Map<string, string[]>();
    const descendants = new Map<string, Set<string>>();
    const walk = (items: NavItem[], trail: string[]) => {
      for (const item of items) {
        ancestors.set(item.path, [...trail]);
        for (const a of trail) {
          let bucket = descendants.get(a);
          if (!bucket) { bucket = new Set(); descendants.set(a, bucket); }
          bucket.add(item.path);
        }
        if (item.children) walk(item.children, [...trail, item.path]);
      }
    };
    walk(filteredNavItems, []);
    return { ancestorsByPath: ancestors, descendantsByPath: descendants };
  }, [filteredSections]);

  useEffect(() => {
    // Accordion-style auto-expand: when the route changes, find which
    // parent items lead to the active path and open only them. Anything
    // previously expanded that isn't on the active lineage collapses,
    // so the sidebar mirrors the user's current location instead of
    // accumulating every section they ever opened.
    const lineage: string[] = [];
    const walk = (item: NavItem, ancestors: string[]) => {
      if (!item.children) return;
      const isChildActive = item.children.some(
        (c) => location === c.path || location.startsWith(c.path + "/") || (c.children && c.children.some(gc => location === gc.path || location.startsWith(gc.path + "/")))
      );
      if (isChildActive) {
        lineage.push(...ancestors, item.path);
      }
      for (const child of item.children) {
        walk(child, [...ancestors, item.path]);
      }
    };
    for (const item of filteredNavItems) {
      walk(item, []);
    }
    if (lineage.length === 0) return;
    setExpandedItems((prev) => {
      // Equal sets — bail out so we don't fire a no-op re-render.
      const dedup = Array.from(new Set(lineage));
      if (dedup.length === prev.length && dedup.every((p) => prev.includes(p))) {
        return prev;
      }
      return dedup;
    });
  }, [location]);

    useEffect(() => {
      if (!user) return;
      const sessionId = sessionStorage.getItem("ghayth_session") || crypto.randomUUID();
      sessionStorage.setItem("ghayth_session", sessionId);
      apiFetch("/intelligence/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: location, sessionId }),
      }).catch(() => {});
    }, [location, user]);

    const toggleExpand = (path: string) => {
    // Accordion behavior: opening an item closes every sibling/cousin
    // that isn't a tree-ancestor of the newly-opened path. Ancestors stay
    // open so the navigation tree to the active node remains visible.
    //
    // - close X: drop X and any of its tree-descendants from the expanded set.
    // - open X: keep only X's tree-ancestors, then add X. Anything unrelated
    //   collapses. Ancestry is resolved against the nav tree (see
    //   ancestorsByPath above), not URL-prefix matching — a child whose path
    //   isn't a string-prefix of its parent's path (e.g. الأسطول /fleet →
    //   اللوحات والسائق /module-dashboards?tab=fleet) used to slip through.
    setExpandedItems((prev) => {
      if (prev.includes(path)) {
        const descendants = descendantsByPath.get(path);
        return prev.filter((p) => p !== path && !(descendants && descendants.has(p)));
      }
      const ancestorSet = new Set(ancestorsByPath.get(path) ?? []);
      const keptAncestors = prev.filter((p) => ancestorSet.has(p));
      return [...keptAncestors, path];
    });
  };

  const isItemActive = (item: NavItem): boolean => {
    if (location === item.path) return true;
    if (item.children) {
      return item.children.some(
        (child) => location === child.path || location.startsWith(child.path + "/") || isItemActive(child)
      );
    }
    return location.startsWith(`${item.path}/`);
  };

  const buildBreadcrumbs = () => {
    const crumbs: { label: string; path: string }[] = [{ label: "الرئيسية", path: "/dashboard" }];
    if (location === "/" || location === "/dashboard") return null;

    // Find the DEEPEST nav node whose path is a prefix of the current
    // location, capturing its full ancestor trail. Using longest-prefix
    // match (instead of first-match + early return) means a sub-page under a
    // parent that *has children* — but isn't itself a listed child — still
    // resolves to its module trail instead of rendering no breadcrumb at all.
    let best: { trail: { label: string; path: string }[]; matchLen: number; exact: boolean } | null = null;
    const walk = (items: NavItem[], ancestors: { label: string; path: string }[]) => {
      for (const item of items) {
        if (item.path === "/dashboard") continue;
        // Virtual wrappers (path "#…") are visual sidebar containers, not pages:
        // recurse through them but keep them OUT of the trail, so a multi-module
        // wrapper never becomes a breadcrumb link to a protected route (e.g. /admin)
        // that a non-admin child's user could click into AccessDenied.
        const trail = item.path.startsWith("#")
          ? ancestors
          : [...ancestors, { label: item.label, path: item.path }];
        const onPath = location === item.path || location.startsWith(item.path + "/");
        if (onPath && (!best || item.path.length > best.matchLen)) {
          best = { trail, matchLen: item.path.length, exact: location === item.path };
        }
        if (item.children) walk(item.children, trail);
      }
    };
    walk(allNavItems, []);

    if (best) {
      const match = best as { trail: { label: string; path: string }[]; matchLen: number; exact: boolean };
      crumbs.push(...match.trail);
      if (!match.exact) {
        // Location is deeper than the matched nav node (a detail / sub-page).
        // Prefer the resolved page label; fall back to a generic "تفاصيل".
        const leaf = findInTree(allNavItems, location);
        const last = match.trail[match.trail.length - 1];
        const leafLabel = leaf && leaf.label !== last.label ? leaf.label : "تفاصيل";
        crumbs.push({ label: leafLabel, path: location });
      }
    }

    if (crumbs.length <= 1) return null;

    return (
      <div className="bg-surface-subtle border-b border-border px-4 lg:px-8 py-2 flex-shrink-0">
        <nav aria-label="شريط المسار">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {crumbs.map((crumb, i) => (
              <li key={crumb.path + i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronLeft className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />}
                {i === crumbs.length - 1 ? (
                  <span className="text-gray-800 font-medium">{crumb.label}</span>
                ) : (
                  <Link href={crumb.path} className="hover:text-status-info-foreground transition-colors">
                    {i === 0 ? (
                      <span className="flex items-center gap-1">
                        <Home className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{crumb.label}</span>
                      </span>
                    ) : crumb.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    );
  };

  const renderNavItem = (item: NavItem, isChild = false) => {
    const isActive = isItemActive(item);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.path);

    if (isSidebarCollapsed && isChild) return null;

    if (isSidebarCollapsed) {
      const targetPath = hasChildren && item.children!.length > 0 ? item.children![0].path : item.path;
      return (
        <Link key={item.path} href={targetPath}>
          <span
            className={cn(
              "flex items-center justify-center py-2.5 rounded-lg transition-colors cursor-pointer",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-subtle hover:text-gray-900"
            )}
            title={item.label}
          >
            <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
          </span>
        </Link>
      );
    }

    if (hasChildren) {
      return (
        <div key={item.path}>
          <button
            onClick={() => toggleExpand(item.path)}
            className={cn(
              "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-subtle hover:text-gray-900"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </div>
            <div className="flex items-center gap-1.5">
              {!isExpanded && item.children && item.children.length > 0 && (
                <span className="text-[10px] text-muted-foreground bg-gray-100 rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {item.children.length}
                </span>
              )}
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </div>
          </button>
          {isExpanded && (
            <div className="ms-4 mt-0.5 space-y-0.5 border-s-2 border-border ps-2">
              {item.children!.map((child) => renderNavItem(child, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link key={item.path} href={item.path}>
        <span
          className={cn(
            "flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer",
            isChild ? "py-1.5" : "py-2",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-surface-subtle hover:text-gray-900"
          )}
        >
          <item.icon className={cn(isChild ? "h-3.5 w-3.5" : "h-[18px] w-[18px]", isActive ? "text-primary" : "text-muted-foreground")} />
          {item.label}
        </span>
      </Link>
    );
  };

  const findInTree = (items: NavItem[], loc: string): { label: string; icon: any } | null => {
    for (const item of items) {
      if (item.path === loc) return { label: item.label, icon: item.icon };
      if (item.children) {
        const found = findInTree(item.children, loc);
        if (found) return found;
      }
      if (!item.children && loc.startsWith(item.path + "/")) {
        return { label: item.label, icon: item.icon };
      }
    }
    return null;
  };

  const getPageTitle = () => {
    for (const item of allNavItems) {
      const found = findInTree([item], location);
      if (found) return { label: found.label, Icon: found.icon };
    }
    return { label: "الرئيسية", Icon: LayoutDashboard };
  };

  const { label: pageTitle, Icon: PageIcon } = getPageTitle();
  const currentRoleColor = selectedRoleColor;

  interface QuickAction {
    label: string;
    icon: any;
    link: string;
    minRoleLevel?: number;
  }

  const pageQuickActions: Record<string, QuickAction[]> = {
    "/employees": [
      { label: "إضافة موظف", icon: Plus, link: "/employees/create" },
      { label: "تصدير", icon: Download, link: "/employees?export=1" },
    ],
    "/hr": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "تسجيل حضور", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "عرض الموظفين", icon: Users2, link: "/employees" },
    ],
    "/hr/leaves": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "اعتماد الطلبات", icon: CheckSquare, link: "/hr/leaves?tab=pending", minRoleLevel: 40 },
    ],
    "/hr/leaves/approval-chains": [
      { label: "طلب إجازة", icon: Plus, link: "/hr/leaves/create" },
      { label: "إدارة الإجازات", icon: ClipboardList, link: "/hr/leaves" },
    ],
    "/hr/attendance": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
    ],
    "/hr/attendance/reports": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تتبع ميداني", icon: MapPin, link: "/hr/attendance/field-tracking" },
    ],
    "/hr/attendance/field-tracking": [
      { label: "تسجيل حضور بالرمز المصوّر", icon: QrCode, link: "/hr/attendance/qr-scanner" },
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
    ],
    "/hr/attendance/qr-scanner": [
      { label: "تقارير الحضور", icon: BarChart3, link: "/hr/attendance/reports" },
      { label: "تتبع ميداني", icon: MapPin, link: "/hr/attendance/field-tracking" },
    ],
    "/hr/payroll": [
      { label: "مسير رواتب جديد", icon: Plus, link: "/hr/payroll/create" },
      { label: "مكونات الرواتب", icon: Settings, link: "/hr/payroll/salary-components" },
    ],
    "/hr/payroll/salary-components": [
      { label: "مسير رواتب جديد", icon: Plus, link: "/hr/payroll/create" },
      { label: "مسيرات الرواتب", icon: DollarSign, link: "/hr/payroll" },
    ],
    "/hr/performance": [
      { label: "تقييم جديد", icon: Plus, link: "/hr/performance/create" },
    ],
    "/hr/training": [
      { label: "برنامج تدريبي جديد", icon: Plus, link: "/hr/training/create" },
    ],
    "/hr/recruitment": [
      { label: "وظيفة جديدة", icon: Plus, link: "/hr/recruitment/create" },
      { label: "المتقدمين", icon: Users2, link: "/hr/recruitment/applications" },
    ],
    "/hr/recruitment/applications": [
      { label: "وظيفة جديدة", icon: Plus, link: "/hr/recruitment/create" },
      { label: "الوظائف", icon: Briefcase, link: "/hr/recruitment" },
    ],
    "/hr/loans": [
      { label: "طلب سلفة جديدة", icon: Plus, link: "/hr/loans/create" },
      { label: "الرواتب", icon: DollarSign, link: "/hr/payroll" },
    ],
    "/hr/overtime": [
      { label: "طلب وقت إضافي", icon: Plus, link: "/hr/overtime/create" },
      { label: "الحضور", icon: Clock, link: "/hr/attendance" },
    ],
    "/hr/exit": [
      { label: "طلب نهاية خدمة", icon: Plus, link: "/hr/exit/create" },
      { label: "مكافأة نهاية الخدمة", icon: DollarSign, link: "/hr/gratuity" },
    ],
    "/hr/violations": [
      { label: "مخالفة جديدة", icon: Plus, link: "/hr/violations/create" },
      { label: "الرصد التلقائي", icon: Radar, link: "/hr/violations/auto-detection" },
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/violations?tab=memos" },
      { label: "لائحة الانضباط", icon: BookOpen, link: "/hr/discipline/regulation" },
    ],
    "/hr/violations/auto-detection": [
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
      { label: "مخالفة جديدة", icon: Plus, link: "/hr/violations/create" },
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/violations?tab=memos" },
    ],
    "/hr/discipline/regulation": [
      { label: "محاضر الاستفسار", icon: FileText, link: "/hr/violations?tab=memos" },
      { label: "المخالفات", icon: AlertTriangle, link: "/hr/violations" },
    ],
    "/hr/shifts": [
      { label: "وردية جديدة", icon: Plus, link: "/hr/shifts/create" },
    ],
    "/finance/invoices": [
      { label: "فاتورة جديدة", icon: Plus, link: "/finance/invoices/create" },
      { label: "طباعة", icon: Printer, link: "/finance/invoices?action=print", minRoleLevel: 40 },
    ],
    "/finance/expenses": [
      { label: "مصروف جديد", icon: Plus, link: "/finance/expenses?action=new" },
      { label: "اعتماد المصروفات", icon: CheckSquare, link: "/finance/expenses?tab=pending", minRoleLevel: 40 },
    ],
    "/finance/vouchers": [
      { label: "سند جديد", icon: Plus, link: "/finance/documents/create" },
    ],
    "/finance/purchase-orders": [
      { label: "طلب شراء جديد", icon: Plus, link: "/finance/purchase-orders?action=new" },
      { label: "اعتماد الطلبات", icon: CheckSquare, link: "/finance/purchase-orders?tab=pending", minRoleLevel: 40 },
    ],
    "/tasks": [
      { label: "مهمة جديدة", icon: Plus, link: "/tasks?action=new" },
    ],
    "/projects": [
      { label: "مشروع جديد", icon: Plus, link: "/projects/create" },
    ],
    "/clients": [
      { label: "عميل جديد", icon: Plus, link: "/clients/create" },
    ],
    "/fleet": [
      { label: "مركبة جديدة", icon: Plus, link: "/fleet?action=new" },
    ],
    "/support": [
      { label: "تذكرة جديدة", icon: Plus, link: "/support/create" },
    ],
    "/requests": [
      { label: "تقديم طلب", icon: Send, link: "/requests?action=new" },
    ],
    "/warehouse": [
      { label: "منتج جديد", icon: Plus, link: "/warehouse?action=new" },
    ],
    "/properties": [
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
    ],
    "/properties/dashboard": [
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
      { label: "عقد جديد", icon: Plus, link: "/properties/contracts/create" },
    ],
    "/properties/buildings": [
      { label: "مبنى جديد", icon: Plus, link: "/properties/buildings/create" },
      { label: "وحدة جديدة", icon: Plus, link: "/properties/create" },
    ],
    "/properties/tenants": [
      { label: "مستأجر جديد", icon: Plus, link: "/properties/tenants/create" },
    ],
    "/properties/contracts": [
      { label: "عقد إيجار جديد", icon: Plus, link: "/properties/contracts/create" },
    ],
    "/properties/payments": [
      { label: "تسجيل دفعة", icon: Plus, link: "/properties/payments?action=new" },
    ],
    "/properties/maintenance": [
      { label: "طلب صيانة جديد", icon: Plus, link: "/properties/maintenance/create" },
    ],
    "/umrah": [
      { label: "استيراد معتمرين", icon: FileText, link: "/umrah/import" },
      { label: "إضافة معتمر", icon: Plus, link: "/umrah/pilgrims?action=create" },
      { label: "إنشاء فاتورة", icon: Receipt, link: "/umrah/invoices?action=generate" },
    ],
    "/umrah/pilgrims": [
      { label: "إضافة معتمر", icon: Plus, link: "/umrah/pilgrims?action=create" },
      { label: "استيراد من ملف", icon: FileText, link: "/umrah/import" },
    ],
    "/umrah/agents": [
      { label: "إضافة وكيل", icon: Plus, link: "/umrah/agents?action=create" },
    ],
    "/umrah/sub-agents": [
      { label: "إضافة وكيل فرعي", icon: Plus, link: "/umrah/sub-agents?action=create" },
    ],
    "/umrah/invoices": [
      { label: "إنشاء فاتورة", icon: Plus, link: "/umrah/invoices?action=generate" },
    ],
    "/umrah/pricing": [
      { label: "إضافة تسعيرة", icon: Plus, link: "/umrah/pricing?action=create" },
    ],
    "/umrah/commission-plans": [
      { label: "إنشاء خطة عمولة", icon: Plus, link: "/umrah/commission-plans?action=create" },
    ],
    "/umrah/transport": [
      { label: "إضافة رحلة", icon: Plus, link: "/umrah/transport?action=create" },
    ],
    "/umrah/penalties": [
      { label: "إضافة غرامة", icon: Plus, link: "/umrah/penalties?action=create" },
    ],
    "/legal": [
      { label: "إنشاء قضية", icon: Plus, link: "/legal?tab=cases&action=create" },
      { label: "إنشاء عقد", icon: Plus, link: "/legal?tab=contracts&action=create" },
    ],
    "/crm": [
      { label: "فرصة جديدة", icon: Plus, link: "/crm?tab=opportunities&action=create" },
      { label: "صفقة جديدة", icon: Plus, link: "/crm?tab=deals&action=create" },
    ],
  };

  const resolveQuickActions = (path: string): QuickAction[] => {
    if (pageQuickActions[path]) return pageQuickActions[path];
    const segments = path.split("/").filter(Boolean);
    while (segments.length > 0) {
      segments.pop();
      const parentPath = "/" + segments.join("/");
      if (pageQuickActions[parentPath]) return pageQuickActions[parentPath];
    }
    return [];
  };

  const currentQuickActions = resolveQuickActions(location).filter(
    (a) => !a.minRoleLevel || effectiveRoleLevel >= a.minRoleLevel
  );

  return (
    <div className="h-screen bg-surface-subtle flex overflow-hidden" dir="rtl">
      <aside
        className={cn(
          "bg-white border-e border-border fixed inset-y-0 start-0 z-50 flex-shrink-0 transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "w-16" : "w-64",
          isSidebarOpen ? "translate-x-0" : "translate-x-full",
          "lg:!translate-x-0"
        )}
      >
        <div className="h-full flex flex-col">
          <div className={cn("h-14 flex items-center border-b border-border", isSidebarCollapsed ? "justify-center px-2" : "justify-between px-5")}>
            {isSidebarCollapsed ? (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg text-primary hover:bg-surface-subtle transition-colors"
                title="توسيع القائمة"
              >
                <GhaythLogo size={24} />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 font-bold text-lg text-primary">
                  <GhaythLogo size={24} />
                  <span>{globalSettings.companyName || "منصة غيث"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden lg:flex h-8 w-8 text-muted-foreground hover:text-muted-foreground"
                    onClick={() => setIsSidebarCollapsed(true)}
                    title="طي القائمة"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden h-8 w-8"
                    onClick={() => setIsSidebarOpen(false)}
                    title="إغلاق القائمة"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>

          <nav className={cn("flex-1 overflow-y-auto py-2", isSidebarCollapsed ? "px-1" : "px-3")}>
            {filteredSections.map((section, sectionIdx) => (
              <div key={section.title}>
                {sectionIdx > 0 && (
                  <div className={cn("my-2 border-t border-border", isSidebarCollapsed ? "mx-1" : "mx-2")} />
                )}
                {section.title !== "الرئيسية" && !isSidebarCollapsed && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => renderNavItem(item))}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn("border-t border-border", isSidebarCollapsed ? "p-2" : "p-3")}>
            {isSidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: currentRoleColor }}
                  title={user?.name || "مستخدم"}
                >
                  {(user?.name || "مستخدم").substring(0, 2)}
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="تسجيل الخروج" className="h-7 w-7">
                  <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: currentRoleColor }}
                >
                  {(user?.name || "مستخدم").substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name || "مستخدم"}</p>
                  <p className="text-xs truncate" style={{ color: currentRoleColor }}>
                    {jobTitle || selectedRoleLabel}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="تسجيل الخروج" className="h-8 w-8">
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={cn("flex-1 flex flex-col min-w-0 h-screen overflow-hidden transition-all duration-300", isSidebarCollapsed ? "lg:ms-16" : "lg:ms-64")}>
        <header className="bg-white border-b border-border h-14 flex items-center justify-between gap-2 px-4 lg:px-6 flex-shrink-0 z-40">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setIsSidebarOpen(true)}
              title="فتح القائمة"
            >
              <Menu className="h-5 w-5" />
            </Button>
            {location !== "/dashboard" && location !== "/" && (
              // Slot composition (issue #639) — rendering Button asChild
              // makes the host element the <a> from <Link>, avoiding the
              // invalid `<a><button>` nesting that the old wrapper form
              // produced.
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-status-info-foreground" title="الرجوع للرئيسية">
                <Link href="/dashboard">
                  <Home className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2 min-w-0">
              <PageIcon className="h-[18px] w-[18px] text-status-info-foreground shrink-0" />
              <span className="hidden sm:inline truncate">{pageTitle}</span>
            </h1>
            {currentQuickActions.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 ms-3">
                {currentQuickActions.map((action) => (
                  // Slot composition (issue #639) — Button asChild renders
                  // the <a> from <Link> as the host element so we don't
                  // nest a <button> inside an <a>.
                  <Button asChild key={action.link} variant="outline" size="sm" className="h-7 text-xs gap-1.5 bg-white">
                    <Link href={action.link}>
                      <action.icon className="h-3.5 w-3.5" />
                      {action.label}
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:block">
              <button
                onClick={() => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); }}
                className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground border border-border rounded-lg bg-surface-subtle hover:bg-white hover:border-status-info-surface hover:text-muted-foreground transition-all w-44 lg:w-56 xl:w-72"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-start">بحث في الصفحات والإجراءات...</span>
                <kbd className="hidden lg:flex items-center gap-0.5 text-[10px] text-gray-300 bg-white border border-border rounded px-1 py-0.5">Ctrl+K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-1 border border-border rounded-lg px-1 py-0.5 bg-surface-subtle/50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="gap-1.5 px-2 h-8 hover:bg-white"
                    style={{ color: currentRoleColor }}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline-block max-w-[130px] truncate text-xs font-medium">
                      {jobTitle || selectedRoleLabel}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">تغيير الصفة الوظيفية</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userRoles.map((role) => {
                    const color = roleKeyColors[role.roleKey] || "#95A5A6";
                    const isActive = selectedRole?.roleKey === role.roleKey;
                    return (
                      <DropdownMenuItem
                        key={`${role.source ?? "legacy"}:${role.roleKey}`}
                        onClick={() => setSelectedRoleKey(role.roleKey)}
                        className={isActive ? "bg-purple-50" : ""}
                      >
                        <Shield className="h-4 w-4 me-2" style={{ color }} />
                        <span className="flex-1" style={{ color: isActive ? color : undefined }}>
                          {role.label}
                        </span>
                        {role.source === "v2" && (
                          <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono">
                            v2
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                  {userRoles.length === 0 && (
                    <DropdownMenuItem disabled>
                      <span className="text-muted-foreground text-xs">لا توجد أدوار مسندة</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {companies.length > 1 ? (
                <>
                  <div className="w-px h-5 bg-gray-200" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-1.5 px-2 h-8 text-emerald-700 hover:bg-white">
                        <Building className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="hidden sm:inline-block max-w-[150px] truncate text-xs font-medium">
                          {selectedCompanyIds.length === 0
                            ? "جميع الشركات"
                            : selectedCompanyIds.length === 1
                              ? (companies.find(c => c.id === selectedCompanyIds[0])?.name || "شركة")
                              : `${selectedCompanyIds.length} شركات`}
                        </span>
                        {selectedCompanyIds.length > 1 && (
                          <span className="bg-emerald-600 text-white text-[10px] px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                            {selectedCompanyIds.length}
                          </span>
                        )}
                        <ChevronDown className="h-3 w-3 text-emerald-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">اختيار الشركات</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setSelectedCompanyIds([])}
                        className={selectedCompanyIds.length === 0 ? "bg-emerald-50 text-emerald-700 font-medium" : ""}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedCompanyIds.length === 0 ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                            {selectedCompanyIds.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <Building className="h-4 w-4 text-emerald-500" />
                          <span>جميع الشركات</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {companies.map((company) => {
                        const isSelected = selectedCompanyIds.includes(company.id);
                        return (
                          <DropdownMenuItem
                            key={company.id}
                            onClick={(e) => {
                              e.preventDefault();
                              if (isSelected) {
                                const updated = selectedCompanyIds.filter(id => id !== company.id);
                                setSelectedCompanyIds(updated);
                              } else {
                                const updated = [...selectedCompanyIds, company.id];
                                setSelectedCompanyIds(updated);
                                if (updated.length === 1) {
                                  switchToCompany(company.id);
                                }
                              }
                            }}
                            className={isSelected ? "bg-emerald-50" : ""}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                                {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                              </div>
                              <Building className={`h-4 w-4 ${isSelected ? "text-emerald-600" : "text-muted-foreground"}`} />
                              <span>{company.name}</span>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : companies.length === 1 ? (
                <>
                  <div className="w-px h-5 bg-gray-200" />
                  <div
                    className="flex items-center gap-1.5 px-2 h-8 text-emerald-700"
                    title={companies[0]?.name || "الشركة"}
                  >
                    <Building className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="hidden sm:inline-block max-w-[150px] truncate text-xs font-medium">
                      {companies[0]?.name || "الشركة"}
                    </span>
                  </div>
                </>
              ) : null}

              <div className="w-px h-5 bg-gray-200" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-1.5 px-2 h-8 text-status-info-foreground hover:bg-white">
                    <Building2 className="h-3.5 w-3.5 text-status-info-foreground" />
                    <span className="hidden sm:inline-block max-w-[130px] truncate text-xs font-medium">
                      {selectedBranchIds.length === 0
                        ? "جميع الفروع"
                        : selectedBranchIds.length === 1
                          ? (filteredBranches.find(b => b.id === selectedBranchIds[0])?.name || "فرع")
                          : `${selectedBranchIds.length} فروع`}
                    </span>
                    {selectedBranchIds.length > 1 && (
                      <span className="bg-blue-600 text-white text-[10px] px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                        {selectedBranchIds.length}
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3 text-blue-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">اختيار الفروع</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSelectedBranchIds([])}
                    className={selectedBranchIds.length === 0 ? "bg-status-info-surface text-status-info-foreground font-medium" : ""}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedBranchIds.length === 0 ? "bg-blue-600 border-blue-600" : "border-border"}`}>
                        {selectedBranchIds.length === 0 && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <Building2 className="h-4 w-4 text-blue-500" />
                      <span>جميع الفروع</span>
                      <span className="ms-auto text-xs bg-blue-100 text-status-info-foreground px-1.5 py-0.5 rounded">الكل</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {filteredBranches.map((branch) => {
                    const isSelected = selectedBranchIds.includes(branch.id);
                    return (
                      <DropdownMenuItem
                        key={branch.id}
                        onClick={(e) => {
                          e.preventDefault();
                          if (isSelected) {
                            setSelectedBranchIds(selectedBranchIds.filter(id => id !== branch.id));
                          } else {
                            setSelectedBranchIds([...selectedBranchIds, branch.id]);
                          }
                        }}
                        className={isSelected ? "bg-status-info-surface" : ""}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? "bg-blue-600 border-blue-600" : "border-border"}`}>
                            {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <Building2 className={`h-4 w-4 shrink-0 ${isSelected ? "text-status-info-foreground" : "text-muted-foreground"}`} />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{branch.name}</span>
                            {companies.length > 1 && (
                              <span className="text-[11px] text-muted-foreground truncate">
                                {companies.find(c => c.id === branch.companyId)?.name || ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <NotificationDropdown />

            <div className="sm:hidden">
              <button
                onClick={() => { setCommandPaletteFilter(null); setCommandPaletteOpen(true); }}
                className="flex items-center justify-center h-8 w-8 border border-border rounded-lg bg-surface-subtle hover:bg-white text-muted-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {buildBreadcrumbs()}
        <RateLimitFallbackBanner />
        <PolicyBanner currentPath={location} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} initialFilter={commandPaletteFilter} />
        </Suspense>
      )}
    </div>
  );
}
