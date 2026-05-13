import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
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
  | "umrah";

const ALL_MODULES: ModuleType[] = [
  "home", "hr", "finance", "fleet", "property", "operations", "warehouse",
  "governance", "bi", "requests", "documents", "reports", "admin", "comms",
  "legal", "crm", "marketing", "store", "support", "settings", "umrah",
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
  employee: "#95A5A6",
};

const ALL_HR_SUBS = ["employees", "attendance", "leaves", "payroll", "performance", "training", "organization", "recruitment", "violations", "shifts"];

const roleKeySubPages: Record<string, Record<string, string[]>> = {
  owner: { hr: [...ALL_HR_SUBS] },
  general_manager: { hr: [...ALL_HR_SUBS] },
  hr_manager: { hr: [...ALL_HR_SUBS] },
  branch_manager: { hr: ["employees", "attendance", "leaves"] },
};

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

  currentUserId: number | null;
  scopeQueryString: string;
  refreshFilters: () => void;
  switchToCompany: (companyId: number) => Promise<void>;
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

  const [apiData, setApiData] = useState<{ permissions: string[]; modules: string[]; highestLevel: number } | null>(null);
  const [permRefreshKey, setPermRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setApiData(null); return; }
    apiFetch("/permissions/my")
      .then((data: any) => {
        setApiData({
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
          modules: Array.isArray(data?.modules) ? data.modules : [],
          highestLevel: typeof data?.highestLevel === "number" ? data.highestLevel : 10,
        });
      })
      .catch(() => { setApiData(null); });
  }, [isAuthenticated, user?.id, permRefreshKey]);

  const allowedModules: ModuleType[] = useMemo(() => {
    if (apiData !== null) {
      const mods = apiData.modules as ModuleType[];
      if (mods.includes("admin" as ModuleType)) return ALL_MODULES;
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
      const has = (module: string, action: string) =>
        apiData.permissions.includes(`${module}:${action}`) ||
        apiData.permissions.includes(`${module}:*`) ||
        apiData.permissions.includes("*");
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
      .catch(() => setCompanies([]))
      .finally(() => setCompaniesLoading(false));
  }, [isAuthenticated, refreshKey]);

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

  const hasPermission = (permission: PermissionKey) => permissions[permission];
  const canAccessModule = (module: ModuleType) => allowedModules.includes(module);

  const rawPermissions = apiData?.permissions ?? [];
  const isOwnerRole = selectedRole?.roleKey === "owner" || effectiveRoleLevel >= 100;
  const can = useCallback((permission: string): boolean => {
    if (isOwnerRole) return true;
    if (!permission) return true;
    if (rawPermissions.includes("*")) return true;
    if (rawPermissions.includes(permission)) return true;
    const [module] = permission.split(":");
    if (module && rawPermissions.includes(`${module}:*`)) return true;
    return false;
  }, [rawPermissions, isOwnerRole]);

  const canAccessSubPage = useCallback((module: string, subKey: string) => {
    if (!selectedRole) return false;
    const rk = selectedRole.roleKey;
    const perms = roleKeySubPages[rk];
    if (!perms) {
      return allowedModules.includes(module as ModuleType);
    }
    const moduleSubs = perms[module];
    if (!moduleSubs) {
      return allowedModules.includes(module as ModuleType);
    }
    return moduleSubs.includes(subKey);
  }, [selectedRole, allowedModules]);

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
      currentUserId,
      scopeQueryString,
      refreshFilters,
      switchToCompany,
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
