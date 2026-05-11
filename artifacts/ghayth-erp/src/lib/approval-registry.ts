export interface ApprovalTypeDef {
  key: string;
  label: string;
  pendingKey: string;
  approveEndpoint: string;
  badgeClass: string;
}

export const APPROVAL_TYPES: ApprovalTypeDef[] = [
  { key: "leave",          label: "إجازة",       pendingKey: "pendingLeaves",          approveEndpoint: "/hr/leave-requests/:id/approve",          badgeClass: "bg-blue-100 text-blue-700" },
  { key: "advance",        label: "سلفة",        pendingKey: "pendingAdvances",         approveEndpoint: "/finance/salary-advances/:id/approve",    badgeClass: "bg-green-100 text-green-700" },
  { key: "custody",        label: "عُهدة",       pendingKey: "pendingCustodies",        approveEndpoint: "/finance/custodies/:id/approve",          badgeClass: "bg-gray-100 text-gray-700" },
  { key: "letter",         label: "خطاب",        pendingKey: "pendingLetters",          approveEndpoint: "/hr/official-letters/:id/approve",        badgeClass: "bg-purple-100 text-purple-700" },
  { key: "purchase",       label: "طلب شراء",    pendingKey: "pendingPurchases",        approveEndpoint: "/finance/purchase-requests/:id/approve",  badgeClass: "bg-amber-100 text-amber-700" },
  { key: "expense",        label: "مصروف",       pendingKey: "pendingExpenses",         approveEndpoint: "/finance/expenses/:id/approve",           badgeClass: "bg-rose-100 text-rose-700" },
  { key: "loan",           label: "قرض",         pendingKey: "pendingLoans",            approveEndpoint: "/hr/loans/:id/approve",                   badgeClass: "bg-teal-100 text-teal-700" },
  { key: "overtime",       label: "عمل إضافي",   pendingKey: "pendingOvertime",         approveEndpoint: "/hr/overtime/:id/approve",                badgeClass: "bg-cyan-100 text-cyan-700" },
  { key: "exit",           label: "مغادرة",      pendingKey: "pendingExitRequests",     approveEndpoint: "/hr/exit/:id/approve",                    badgeClass: "bg-red-100 text-red-700" },
  { key: "transfer",       label: "نقل",         pendingKey: "pendingTransfers",        approveEndpoint: "/hr/transfers/:id/approve",               badgeClass: "bg-indigo-100 text-indigo-700" },
  { key: "excuse",         label: "استئذان",     pendingKey: "pendingExcuses",          approveEndpoint: "/hr/excuse-requests/:id/approve",         badgeClass: "bg-sky-100 text-sky-700" },
  { key: "violation",      label: "مخالفة",      pendingKey: "pendingViolations",       approveEndpoint: "/hr/violations/:id/approve",              badgeClass: "bg-red-100 text-red-700" },
  { key: "purchase_order", label: "أمر شراء",    pendingKey: "pendingPurchaseOrders",   approveEndpoint: "/finance/purchase-orders/:id/approve",    badgeClass: "bg-orange-100 text-orange-700" },
  { key: "training",       label: "تدريب",       pendingKey: "pendingTrainings",        approveEndpoint: "/hr/programs/:id/approve",                badgeClass: "bg-violet-100 text-violet-700" },
  { key: "maintenance",    label: "صيانة",       pendingKey: "pendingMaintenance",      approveEndpoint: "/property/maintenance-requests/:id/approve", badgeClass: "bg-yellow-100 text-yellow-700" },
  { key: "journal",        label: "قيد يدوي",    pendingKey: "pendingJournals",         approveEndpoint: "/finance/journal-manual/:id/approve",     badgeClass: "bg-lime-100 text-lime-700" },
  { key: "inventory",      label: "جرد",         pendingKey: "pendingInventory",        approveEndpoint: "/warehouse/inventory-counts/:id/approve", badgeClass: "bg-emerald-100 text-emerald-700" },
  { key: "workflow",       label: "سير عمل",    pendingKey: "pendingWorkflows",        approveEndpoint: "/workflows/:id/approve",                  badgeClass: "bg-purple-100 text-purple-700" },
];

const byKey = new Map(APPROVAL_TYPES.map((t) => [t.key, t]));

export function getApprovalEndpoint(type: string, id: number): string {
  const def = byKey.get(type);
  return def ? def.approveEndpoint.replace(":id", String(id)) : "";
}

export function getApprovalLabel(type: string): string {
  return byKey.get(type)?.label ?? type;
}

export function getApprovalBadgeClass(type: string): string {
  return byKey.get(type)?.badgeClass ?? "bg-gray-100 text-gray-700";
}

export function buildAllPending(pending: Record<string, any>): any[] {
  const items: any[] = [];
  for (const def of APPROVAL_TYPES) {
    const arr = pending[def.pendingKey];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        items.push({ ...item, _type: def.key, _label: def.label });
      }
    }
  }
  return items;
}
