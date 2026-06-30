import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { permissionMatches } from "@/lib/permission-match";
import { useQueryClient } from "@tanstack/react-query";

export type ModuleType =
  | "home"
  | "hr"
  | "finance"
  | "fleet"
  | "property"
  | "operations"
  | "warehouse"
  | "governance"
  | "bi"
  | "requests"
  | "documents"
  | "reports"
  | "admin"
  | "comms"
  | "legal"
  | "crm"
  | "marketing"
  | "store"
  | "support"
  | "settings"
  | "umrah"
  | "website";

const ALL_MODULES: ModuleType[] = [
  "home", "hr", "finance", "fleet", "property", "operations", "warehouse",
  "governance", "bi", "requests", "documents", "reports", "admin", "comms",
  "legal", "crm", "marketing", "store", "support", "settings", "umrah",
  "website",
];

export interface UserRole {
  id: number;
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
  source?: "legacy" | "v2";
}

export const roleKeyColors: Record<string, string> = {
  owner: "#C0392B",
  general_manager: "#8E44AD",
  hr_manager: "#2980B9",
  finance_manager: "#27AE60",
  fleet_manager: "#E67E22",
  property_manager: "#1ABC9C",
  projects_manager: "#3498DB",
  warehouse_manager: "#9B59B6",
  legal_manager: "#34495E",
  support_manager: "#F39C12",
  crm_manager: "#E74C3C",
  bi_manager: "#2C3E50",
  branch_manager: "#16A085",
  driver: "#0d9488",
  employee: "#95A5A6",
};

const ALL_HR_SUBS = ["employees", "attendance", "leaves", "payroll", "performance", "training", "organization", "recruitment", "violations", "shifts", "services"];

const roleKeySubPages: Record<string, Record<string, string[]>> = {
  owner: { hr: [...ALL_HR_SUBS] },
  general_manager: { hr: [...ALL_HR_SUBS] },
  hr_manager: { hr: [...ALL_HR_SUBS] },
  branch_manager: { hr: ["employees", "attendance", "leaves"] },
  // HR-REV-1 (#2220) — علاج visible+403: بدون هذه الإدخالات يسقط
  // canAccessSubPage إلى «الوحدة مسموحة ⇒ كل subKeys تظهر»، فيرى الدوران
  // كامل قائمة HR بينما grants محدودة فتُرفض الصفحات بـ403. القصر هنا
  // يُخفي فقط (الـbackend authorize يبقى الحارس الحقيقي).
  // department_manager: hr.employees/attendance/leaves/performance (scope=department).
  department_manager: { hr: ["employees", "attendance", "leaves", "performance"] },
  // payroll_officer: hr.payroll.* + hr.attendance (لا انضباط/توظيف/هيكل).
  payroll_officer: { hr: ["payroll", "attendance"] },
};

// لواحق المفاتيح الذاتية (الخدمة الذاتية): ملفي الشخصي / تسجيل حضوري / إجازاتي.
// منحة على أحد هذه لا تُخوّل الصفحات الإدارية للوحدة — هي فقط تُدخل اسم
// الوحدة الأم في allowedModules. تُستعمل لإيقاف تسريب «ظاهر+403» حيث كان
// الموظف الاستاندر يرى قائمة الموارد البشرية كاملة بسبب منحة ذاتية واحدة
// (hr.employees.self / hr.attendance.checkin). RBAC-REV-STD.
const SELF_FEATURE_SUFFIXES = [".self", ".checkin", ".my"] as const;

/**
 * هل يملك المستخدم منحة فعلية تُخوّله رؤية صفحة فرعية معيّنة (subKey) داخل
 * وحدة؟ بوابة دقيقة **على مستوى الصفحة الفرعية** لا الوحدة — تطابق ما
 * يعتمده الباك تمامًا، فتمنع تسريب «ظاهر+403»:
 *
 *   • منحة شاملة (`*` أو الوحدة `hr` أو `hr.*`) ⇒ كل الصفحات الفرعية.
 *   • منحة محدّدة (`hr.attendance`) ⇒ صفحتها فقط (لا الرواتب ولا المخالفات).
 *   • منحة ذاتية (`hr.employees.self` / `.checkin` / `.my`) ⇒ لا صفحة إدارية.
 *
 * بهذا: الموظف الاستاندر (منح ذاتية فقط) لا يرى صفحات HR الإدارية، ومسؤول
 * الحضور (`hr.attendance` فقط) يرى الحضور فقط، ومدير HR (`hr.*`) يرى الكل —
 * كلها مشتقّة من المنح، بلا قوائم أدوار ثابتة. RBAC-REV-STD.
 */
export function hasGrantForSubPage(
  rawPermissions: readonly string[],
  module: string,
  subKey: string,
): boolean {
  const subFeature = `${module}.${subKey}`; // "hr.attendance"
  for (const p of rawPermissions) {
    const scope = p.split(":")[0]; // feature_key: "hr" | "hr.*" | "hr.attendance" | "hr.employees.self"
    if (!scope) continue;
    if (scope === "*") return true; // مالك/وكيل شامل
    if (scope === module || scope === `${module}.*`) return true; // منحة وحدة شاملة
    if (SELF_FEATURE_SUFFIXES.some((s) => scope.endsWith(s))) continue; // ذاتية ⇒ ليست إدارية
    if (scope === subFeature || scope.startsWith(`${subFeature}.`)) return true; // الصفحة الفرعية بالضبط (أو أعمق: hr.payroll.wps)
  }
  return false;
}

export type PermissionKey =
  | "canViewAllBranches"
  | "canManageViolations"
  | "canManageEmployees"
  | "canApproveLeaves"
  | "canViewReports"
  | "canManageSettings"
  | "canManageUsers"
  | "canManageRoles"
  | "canViewAuditLogs"
  | "canManageFinance"
  | "canManageFleet"
  | "canManageProperty"
  | "canManageGovernance"
  | "canManageBI"
  | "canManageLegal";

type PermissionSet = Record<PermissionKey, boolean>;

function buildPermissions(level: number, modules: string[]): PermissionSet {
  const has = (m: string) => modules.includes(m);
  return {
    canViewAllBranches: level >= 90,
    canManageViolations: level >= 70 && has("hr"),
    canManageEmployees: level >= 50 && has("hr"),
    canApproveLeaves: level >= 50 && has("hr"),
    canViewReports: level >= 50,
    canManageSettings: level >= 90,
    canManageUsers: level >= 100,
    canManageRoles: level >= 100,
    canViewAuditLogs: level >= 90,
    canManageFinance: has("finance"),
    canManageFleet: has("fleet"),
    canManageProperty: has("property"),
    canManageGovernance: has("governance"),
    canManageBI: has("bi"),
    canManageLegal: has("legal"),
  };
}

export interface Company {
  id: number;
  name: string;
  nameEn?: string;
}

export interface Branch {
  id: number;
  name: string;
  code?: string;
  companyId?: number;
}

interface AppContextType {
  selectedRole: UserRole | null;
  setSelectedRoleKey: (roleKey: string) => void;
  userRoles: UserRole[];
  roleLevel: number;
  effectiveRoleLevel: number;
  selectedRoleLabel: string;
  selectedRoleColor: string;
  jobTitle: string | null;

  companies: Company[];
  companiesLoading: boolean;
  selectedCompanyIds: number[];
  setSelectedCompanyIds: (ids: number[]) => void;

  selectedBranchIds: number[];
  setSelectedBranchIds: (ids: number[]) => void;
  selectedBranchId: number | null;
  branches: Branch[];
  branchesLoading: boolean;
  currentBranch: Branch | null;
  allowedBranchIds: number[];
  isMultiBranch: boolean;
  isMultiCompany: boolean;
  filteredBranches: Branch[];

  permissions: PermissionSet;
  hasPermission: (permission: PermissionKey) => boolean;

  /**
   * Raw `module:action` permissions from the backend. Use `can()` for
   * fine-grained permission gating that mirrors the backend exactly.
   * Unlike `hasPermission(key)` which is limited to 16 preset keys, `can()`
   * accepts any `module:action` string and respects wildcards (`*`, `module:*`).
   *
   *   can("finance:create")   // show "Create Invoice" button?
   *   can("hr:approve")       // show "Approve Leave" action?
   *
   * Returns true for owner and for any matching permission in the raw set.
   */
  can: (permission: string) => boolean;
  rawPermissions: string[];

  allowedModules: ModuleType[];
  canAccessModule: (module: ModuleType) => boolean;

  canAccessSubPage: (module: string, subKey: string) => boolean;

  /**
   * VIS-002 (Ghaith Operating Foundation): partial activation. A feature/track
   * is ENABLED by default and only hidden when explicitly disabled for the
   * company (company_feature_flags). Default-ON keeps existing behaviour
   * unchanged when no flags are set, and lets a supporting service appear only
   * within context once subscribed. See docs/frontend/VISIBILITY_ENGINE_SPEC.md.
   */
  isFeatureEnabled: (featureKey: string) => boolean;

  currentUserId: number | null;
  scopeQueryString: string;
  refreshFilters: () => void;
  switchToCompany: (companyId: number) => Promise<void>;
  switchToBranch: (branchId: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, assignments, isAuthenticated, notifyTokenRefreshed } = useAuth();
  const queryClient = useQueryClient();

  const backendRoles: UserRole[] = useMemo(() => {
    if (user?.userRoles && Array.isArray(user.userRoles) && user.userRoles.length > 0) {
      return user.userRoles;
    }
    return [];
  }, [user?.userRoles]);

  const [selectedRoleKey, setSelectedRoleKeyState] = useState<string>(() => {
    return localStorage.getItem("erp_selected_role_key") || "";
  });

  useEffect(() => {
    if (backendRoles.length > 0 && !backendRoles.find(r => r.roleKey === selectedRoleKey)) {
      const key = backendRoles[0].roleKey;
      setSelectedRoleKeyState(key);
      localStorage.setItem("erp_selected_role_key", key);
    }
  }, [backendRoles]);

  const selectedRole = useMemo(() => {
    return backendRoles.find(r => r.roleKey === selectedRoleKey) || backendRoles[0] || null;
  }, [backendRoles, selectedRoleKey]);

  const setSelectedRoleKey = (key: string) => {
    setSelectedRoleKeyState(key);
    localStorage.setItem("erp_selected_role_key", key);
  };

  const roleLevel = selectedRole?.level ?? 10;
  const selectedRoleLabel = selectedRole?.label ?? "موظف";
  const selectedRoleColor = roleKeyColors[selectedRole?.roleKey ?? "employee"] ?? "#95A5A6";
  const jobTitle = user?.jobTitle || null;

  const [apiData, setApiData] = useState<{ permissions: string[]; modules: string[]; highestLevel: number; disabledFeatures: string[] } | null>(null);
  const [permRefreshKey, setPermRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setApiData(null); return; }
    // apiFetch automatically sends the picked role as `x-selected-role`,
    // and authMiddleware narrows scope.role + authzEngine grants to that
    // role on the backend. We just need to refetch here whenever the
    // user changes their pick so the local apiData (which drives the
    // sidebar and button gating) reflects the new scope.
    apiFetch("/permissions/my")
      .then((data: any) => {
        setApiData({
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
          modules: Array.isArray(data?.modules) ? data.modules : [],
          highestLevel: typeof data?.highestLevel === "number" ? data.highestLevel : 10,
          // VIS-002: default-ON — missing/older backend ⇒ empty ⇒ all enabled.
          disabledFeatures: Array.isArray(data?.disabledFeatures) ? data.disabledFeatures : [],
        });
      })
      .catch(() => { setApiData(null); });
  }, [isAuthenticated, user?.id, permRefreshKey, selectedRoleKey]);

  // Bust React Query cache when the picked role changes so any in-flight
  // list/detail data gets refetched under the new role's permissions.
  useEffect(() => {
    if (!isAuthenticated) return;
    queryClient.clear();
  }, [selectedRoleKey, isAuthenticated, queryClient]);

  const allowedModules: ModuleType[] = useMemo(() => {
    if (apiData !== null) {
      const mods = apiData.modules as ModuleType[];
      if (
        mods.includes("all" as ModuleType) ||
        mods.includes("*" as ModuleType) ||
        mods.includes("admin" as ModuleType)
      ) return ALL_MODULES;
      return mods.length > 0 ? mods : (["home"] as ModuleType[]);
    }
    if (!selectedRole) return ["home", "requests", "documents", "comms"] as ModuleType[];
    const mods = selectedRole.modules;
    if (!mods) return ["home", "requests", "documents", "comms"] as ModuleType[];
    if (typeof mods === "object" && !Array.isArray(mods) && (mods as any).all) {
      return ALL_MODULES;
    }
    if (Array.isArray(mods)) return mods as ModuleType[];
    return ["home", "requests", "documents", "comms"] as ModuleType[];
  }, [selectedRole, apiData]);

  const effectiveRoleLevel = apiData?.highestLevel ?? roleLevel;

  const permissions = useMemo(() => {
    if (apiData !== null) {
      // Coarse preset flags — route through the unified matcher so a fine
      // RBAC grant (module.feature:action) lights the coarse preset too, now
      // that the bridge projects RBAC grants as fine-only.
      const has = (module: string, action: string) =>
        permissionMatches(apiData.permissions, `${module}:${action}`);
      return {
        canViewAllBranches: has("admin", "read") || has("reports", "read"),
        canManageViolations: has("hr", "approve") || has("hr", "write"),
        canManageEmployees: has("hr", "write"),
        canApproveLeaves: has("hr", "approve"),
        canViewReports: has("reports", "read"),
        canManageSettings: has("settings", "write"),
        canManageUsers: has("admin", "write"),
        canManageRoles: has("admin", "write"),
        canViewAuditLogs: has("audit", "read") || has("admin", "read"),
        canManageFinance: has("finance", "write"),
        canManageFleet: has("fleet", "write"),
        canManageProperty: has("property", "write"),
        canManageGovernance: has("governance", "write"),
        canManageBI: has("bi", "write"),
        canManageLegal: has("legal", "write"),
      };
    }
    return buildPermissions(effectiveRoleLevel, allowedModules as string[]);
  }, [effectiveRoleLevel, allowedModules, apiData]);

  const [selectedCompanyIds, setSelectedCompanyIdsState] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("erp_selected_companies");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [selectedBranchIds, setSelectedBranchIdsState] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("erp_selected_branches");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const setSelectedCompanyIds = (ids: number[]) => {
    setSelectedCompanyIdsState(ids);
    localStorage.setItem("erp_selected_companies", JSON.stringify(ids));
  };

  const setSelectedBranchIds = (ids: number[]) => {
    setSelectedBranchIdsState(ids);
    localStorage.setItem("erp_selected_branches", JSON.stringify(ids));
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setCompaniesLoading(true);
    apiFetch("/settings/companies")
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        setCompanies(list);
      })
      .catch(() => {
        // Fall back to companies derived from the user's assignments (mirrors
        // the branches fallback below) so a transient /settings/companies
        // failure (429/network/timeout) does not silently empty the list and
        // hide the topbar company switcher for the rest of the session.
        if (assignments.length) {
          const seen = new Set<number>();
          const fallback: Company[] = [];
          for (const a of assignments as any[]) {
            if (a.companyId && !seen.has(a.companyId)) {
              seen.add(a.companyId);
              fallback.push({ id: a.companyId, name: a.companyName || `شركة #${a.companyId}` });
            }
          }
          setCompanies(fallback);
        } else {
          setCompanies([]);
        }
      })
      .finally(() => setCompaniesLoading(false));
    // `assignments.length` is in the deps so that if the initial fetch fails
    // before assignments are loaded, the effect re-runs once they arrive and
    // the fallback above can populate the switcher (cold-start race).
  }, [isAuthenticated, refreshKey, assignments.length]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setBranchesLoading(true);
    apiFetch("/settings/branches")
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        setBranches(list);
      })
      .catch(() => {
        if (assignments.length) {
          setBranches(assignments.map((a: any) => ({ id: a.branchId, name: a.branchName, companyId: a.companyId })));
        }
      })
      .finally(() => setBranchesLoading(false));
  }, [isAuthenticated, refreshKey]);

  const filteredBranches = selectedCompanyIds.length > 0
    ? branches.filter((b) => b.companyId && selectedCompanyIds.includes(b.companyId))
    : branches;

  useEffect(() => {
    if (selectedCompanyIds.length > 0 && selectedBranchIds.length > 0) {
      const validBranchIds = selectedBranchIds.filter((id) =>
        filteredBranches.some((b) => b.id === id)
      );
      if (validBranchIds.length !== selectedBranchIds.length) {
        setSelectedBranchIds(validBranchIds);
      }
    }
  }, [selectedCompanyIds, filteredBranches]);

  // When a single company is freshly opened, land the user directly on its
  // main branch (الفرع الرئيسي) instead of "جميع الفروع". "Main" = a branch
  // whose name contains رئيس, else the earliest-created (lowest id) branch of
  // that company. Keyed on company *change* via a ref so the user can still
  // manually pick "جميع الفروع" or another branch within the same company,
  // and a branch already restored from localStorage is respected.
  const lastAutoBranchCompanyRef = useRef<number | null>(null);
  useEffect(() => {
    const single = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null;
    if (single === null) {
      lastAutoBranchCompanyRef.current = null;
      return;
    }
    if (lastAutoBranchCompanyRef.current === single) return;
    const companyBranches = branches.filter((b) => b.companyId === single);
    if (companyBranches.length === 0) return; // branches not loaded yet
    const alreadyValid =
      selectedBranchIds.length > 0 &&
      selectedBranchIds.every((id) => companyBranches.some((b) => b.id === id));
    lastAutoBranchCompanyRef.current = single;
    if (alreadyValid) return;
    const mainBranch =
      companyBranches.find((b) => b.name && b.name.includes("رئيس")) ??
      [...companyBranches].sort((a, b) => a.id - b.id)[0];
    if (mainBranch) setSelectedBranchIds([mainBranch.id]);
  }, [selectedCompanyIds, branches, selectedBranchIds]);

  const selectedBranchId = selectedBranchIds.length > 0 ? selectedBranchIds[0] : null;
  const currentBranch = branches.find(b => b.id === selectedBranchId) || null;
  const allowedBranchIds = permissions.canViewAllBranches
    ? branches.map(b => b.id)
    : (selectedBranchIds.length > 0 ? selectedBranchIds : branches.slice(0, 1).map(b => b.id));
  const isMultiBranch = selectedBranchIds.length > 1;
  const isMultiCompany = selectedCompanyIds.length > 1;
  const currentUserId = user?.id || null;

  const scopeQueryString = [
    selectedCompanyIds.length > 0 ? `companyIds=${selectedCompanyIds.join(",")}` : "",
    selectedBranchIds.length > 0 ? `branchIds=${selectedBranchIds.join(",")}` : "",
  ].filter(Boolean).join("&");

  const refreshFilters = useCallback(() => setRefreshKey((k) => k + 1), []);

  const switchToCompany = useCallback(async (companyId: number) => {
    const match = assignments.find((a) => a.companyId === companyId);
    if (!match) return;
    try {
      await apiFetch("/auth/switch-assignment", {
        method: "POST",
        body: JSON.stringify({ assignmentId: match.id }),
      });
      notifyTokenRefreshed();
      queryClient.clear();
      setRefreshKey((k) => k + 1);
      setPermRefreshKey((k) => k + 1);
    } catch {
    }
  }, [assignments, notifyTokenRefreshed, queryClient]);

  // Switching the *active assignment* — needed so that POST/PUT handlers,
  // which key off `req.scope.branchId` from the JWT, stamp the user's
  // current pick onto newly-created rows. Without this, the branch picker
  // is read-only: it filters lists but never moves where new records land.
  const switchToBranch = useCallback(async (branchId: number) => {
    const match = assignments.find((a) => a.branchId === branchId);
    if (!match) return; // user is not assigned to that branch — no-op
    try {
      await apiFetch("/auth/switch-assignment", {
        method: "POST",
        body: JSON.stringify({ assignmentId: match.id }),
      });
      notifyTokenRefreshed();
      queryClient.clear();
      setRefreshKey((k) => k + 1);
      setPermRefreshKey((k) => k + 1);
    } catch {
      // Token refresh failures bubble through notifyTokenRefreshed in the
      // 401 path; here we just stay on the old assignment.
    }
  }, [assignments, notifyTokenRefreshed, queryClient]);

  // Auto-sync the active assignment with the branch picker: when exactly
  // one branch is selected and the current JWT assignment is on a
  // different branch, fire the switch. Multi-select stays purely as a
  // read filter (no meaningful "active branch" for inserts when you've
  // picked several).
  useEffect(() => {
    if (selectedBranchIds.length !== 1) return;
    const picked = selectedBranchIds[0];
    if (user?.branchId === picked) return;
    void switchToBranch(picked);
  }, [selectedBranchIds, user?.branchId, switchToBranch]);

  const hasPermission = (permission: PermissionKey) => permissions[permission];
  const canAccessModule = (module: ModuleType) => allowedModules.includes(module);

  // VIS-002: default-ON partial activation. A feature/track key is enabled
  // unless the company explicitly disabled it. Empty set ⇒ no behaviour change.
  const disabledFeatures = apiData?.disabledFeatures ?? [];
  const isFeatureEnabled = useCallback(
    (featureKey: string) => !featureKey || !disabledFeatures.includes(featureKey),
    [disabledFeatures],
  );

  const rawPermissions = apiData?.permissions ?? [];
  const isOwnerRole = selectedRole?.roleKey === "owner" || effectiveRoleLevel >= 100;
  // Unified matcher: accepts both coarse `module:action` and fine
  // `module.feature:action`, with a coarse fallback for fine asks so migrating
  // a gate to the granular form never hides it (strict superset). See
  // lib/permission-match.ts (#1413, الخطة الجذرية §3 م4).
  const can = useCallback((permission: string): boolean => {
    if (isOwnerRole) return true;
    if (!permission) return true;
    return permissionMatches(rawPermissions, permission);
  }, [rawPermissions, isOwnerRole]);

  const canAccessSubPage = useCallback((module: string, subKey: string) => {
    if (!selectedRole) return false;
    if (isOwnerRole) return true;
    const rk = selectedRole.roleKey;
    const perms = roleKeySubPages[rk];
    if (perms) {
      const moduleSubs = perms[module];
      // الخريطة هي المرجع للأدوار المُسجَّلة: تُظهر الصفحات المُصرَّح بها فقط.
      if (moduleSubs) return moduleSubs.includes(subKey);
    }
    // RBAC-REV-STD — منع افتراضي مشتقّ من المنح، دقيق على مستوى الصفحة الفرعية.
    // السلوك القديم (allowedModules.includes(module)) كان يسرّب كل صفحات HR
    // للموظف الاستاندر؛ كما أن فحص الوحدة وحده كان يُظهر كل صفحات HR لدور
    // ضيّق المنح (مسؤول الحضور `hr.attendance` يرى الرواتب → 403). نُظهر كل
    // صفحة فرعية فقط عند وجود منحة فعلية تُخوّلها (شاملة أو محدّدة بها).
    return hasGrantForSubPage(rawPermissions, module, subKey);
  }, [selectedRole, isOwnerRole, rawPermissions]);

  return (
    <AppContext.Provider value={{
      selectedRole,
      setSelectedRoleKey,
      userRoles: backendRoles,
      roleLevel,
      effectiveRoleLevel,
      selectedRoleLabel,
      selectedRoleColor,
      jobTitle,
      companies,
      companiesLoading,
      selectedCompanyIds,
      setSelectedCompanyIds,
      selectedBranchIds,
      setSelectedBranchIds,
      selectedBranchId,
      branches,
      branchesLoading,
      currentBranch,
      allowedBranchIds,
      isMultiBranch,
      isMultiCompany,
      filteredBranches,
      permissions,
      hasPermission,
      can,
      rawPermissions,
      allowedModules,
      canAccessModule,
      canAccessSubPage,
      isFeatureEnabled,
      currentUserId,
      scopeQueryString,
      refreshFilters,
      switchToCompany,
      switchToBranch,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}

/**
 * Returns the AppContext value when mounted under `<AppProvider>`, otherwise
 * `null`. Used by `useApiQuery` to auto-inject the scope query string without
 * throwing on pages that render outside the provider (login, password reset).
 */
export function useAppContextOptional(): AppContextType | null {
  return useContext(AppContext);
}
