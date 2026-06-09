/**
 * Config-driven module → sections map for native mobile browse screens.
 *
 * Each ERP module exposes one or more "sections" (a list endpoint). The generic
 * list screen (`app/m/[module]/[section].tsx`) and the module hub
 * (`app/module/[key].tsx`) render entirely from this config — so adding a module
 * is data, not a new bespoke screen.
 *
 * Field names are *candidates*: the first present, non-empty value wins. This
 * keeps screens resilient to API field drift (e.g. `ref` vs `reference`).
 *
 * Endpoints are verified against routes/index.ts mounts. The server stays the
 * RBAC authority — every endpoint still 403s if a guard fails.
 */
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "default" | "success" | "warning" | "danger" | "info";

export interface ModuleSection {
  key: string;
  label: string;
  icon: IoniconName;
  /** Mounted GET list endpoint (paginated `?page=&limit=`). */
  endpoint: string;
  /** First present field becomes the row title. */
  titleFields: string[];
  /** Present fields joined with " · " under the title. */
  subtitleFields?: string[];
  /** Field holding a status string → rendered as a colored badge. */
  statusField?: string;
  /** First present field formatted as currency (ر.س). */
  amountFields?: string[];
  /** First present field formatted as an Arabic date, appended to subtitle. */
  dateFields?: string[];
}

export interface ModuleDef {
  key: string;
  label: string;
  sections: ModuleSection[];
}

export const MODULE_SECTIONS: Record<string, ModuleDef> = {
  finance: {
    key: "finance",
    label: "المالية",
    sections: [
      { key: "invoices", label: "الفواتير", icon: "receipt-outline", endpoint: "/api/finance/invoices", titleFields: ["ref", "invoiceNumber", "number"], subtitleFields: ["clientName", "customerName"], statusField: "status", amountFields: ["total", "amount"], dateFields: ["issueDate", "createdAt", "date"] },
      { key: "journal", label: "القيود اليومية", icon: "book-outline", endpoint: "/api/finance/journal", titleFields: ["ref", "entryNumber"], subtitleFields: ["description"], statusField: "status", amountFields: ["totalAmount", "amount", "total"], dateFields: ["date", "createdAt"] },
      { key: "purchase-orders", label: "أوامر الشراء", icon: "cart-outline", endpoint: "/api/finance/purchase-orders", titleFields: ["ref", "orderNumber", "poNumber"], subtitleFields: ["supplierName", "vendorName"], statusField: "status", amountFields: ["total", "amount"], dateFields: ["date", "createdAt"] },
      { key: "vendors", label: "الموردون", icon: "business-outline", endpoint: "/api/finance/vendors", titleFields: ["name", "vendorName"], subtitleFields: ["taxNumber", "phone"], statusField: "status", amountFields: ["balance"] },
      { key: "accounts", label: "شجرة الحسابات", icon: "git-branch-outline", endpoint: "/api/finance/accounts", titleFields: ["name", "accountName"], subtitleFields: ["code", "type"], statusField: "status", amountFields: ["balance"] },
    ],
  },
  fleet: {
    key: "fleet",
    label: "الأسطول",
    sections: [
      { key: "vehicles", label: "المركبات", icon: "car-outline", endpoint: "/api/fleet/vehicles", titleFields: ["plateNumber", "plate"], subtitleFields: ["make", "model"], statusField: "status", dateFields: ["expiryDate"] },
      { key: "trips", label: "الرحلات", icon: "navigate-outline", endpoint: "/api/fleet/trips", titleFields: ["destination", "ref", "origin"], subtitleFields: ["driverName", "vehiclePlate"], statusField: "status", dateFields: ["tripDate", "startTime", "date"] },
      { key: "rental-contracts", label: "عقود التأجير", icon: "document-text-outline", endpoint: "/api/fleet/rental-contracts", titleFields: ["contractNumber", "ref"], subtitleFields: ["customerName", "clientName"], statusField: "status", amountFields: ["totalAmount", "total"], dateFields: ["startDate"] },
      { key: "fuel-logs", label: "سجلات الوقود", icon: "flame-outline", endpoint: "/api/fleet/fuel-logs", titleFields: ["vehiclePlate", "ref"], subtitleFields: ["driverName", "stationName"], amountFields: ["cost", "amount", "total"], dateFields: ["date", "createdAt"] },
    ],
  },
  warehouse: {
    key: "warehouse",
    label: "المستودع",
    sections: [
      { key: "products", label: "المنتجات", icon: "cube-outline", endpoint: "/api/warehouse/products", titleFields: ["name", "productName"], subtitleFields: ["sku", "categoryName"], statusField: "status" },
      { key: "movements", label: "حركات المخزون", icon: "swap-horizontal-outline", endpoint: "/api/warehouse/movements", titleFields: ["ref", "movementNumber"], subtitleFields: ["type", "fromWarehouse", "toWarehouse"], statusField: "status", dateFields: ["date", "createdAt"] },
    ],
  },
  operations: {
    key: "operations",
    label: "العمليات والمشاريع",
    sections: [
      { key: "projects", label: "المشاريع", icon: "briefcase-outline", endpoint: "/api/projects", titleFields: ["name", "projectName"], subtitleFields: ["code"], statusField: "status", amountFields: ["budget"], dateFields: ["startDate"] },
      { key: "tasks", label: "المهام", icon: "checkbox-outline", endpoint: "/api/tasks", titleFields: ["title", "name"], subtitleFields: ["assigneeName", "priority"], statusField: "status", dateFields: ["dueDate"] },
    ],
  },
  umrah: {
    key: "umrah",
    label: "العمرة",
    sections: [
      { key: "pilgrims", label: "المعتمرون", icon: "people-outline", endpoint: "/api/umrah/pilgrims", titleFields: ["name", "fullName"], subtitleFields: ["passportNumber", "groupName"], statusField: "status" },
      { key: "groups", label: "المجموعات", icon: "albums-outline", endpoint: "/api/umrah/groups", titleFields: ["name", "groupNumber"], subtitleFields: ["pilgrimCount"], statusField: "status", dateFields: ["arrivalDate"] },
      { key: "agent-invoices", label: "فواتير الوكلاء", icon: "receipt-outline", endpoint: "/api/umrah/agent-invoices", titleFields: ["ref", "invoiceNumber"], subtitleFields: ["agentName"], statusField: "status", amountFields: ["total", "amount"], dateFields: ["date", "createdAt"] },
    ],
  },
  crm: {
    key: "crm",
    label: "العملاء",
    sections: [
      { key: "clients", label: "العملاء", icon: "person-outline", endpoint: "/api/clients", titleFields: ["name", "clientName"], subtitleFields: ["phone", "email"], statusField: "status" },
      { key: "opportunities", label: "الفرص البيعية", icon: "trending-up-outline", endpoint: "/api/crm/opportunities", titleFields: ["title", "name"], subtitleFields: ["clientName"], statusField: "status", amountFields: ["estimatedValue", "value"], dateFields: ["closingDate"] },
    ],
  },
  documents: {
    key: "documents",
    label: "المستندات",
    sections: [
      { key: "documents", label: "المستندات", icon: "document-text-outline", endpoint: "/api/documents", titleFields: ["name", "title"], subtitleFields: ["type", "category"], statusField: "status", dateFields: ["createdAt"] },
    ],
  },
  support: {
    key: "support",
    label: "الدعم",
    sections: [
      { key: "tickets", label: "التذاكر", icon: "help-buoy-outline", endpoint: "/api/support/tickets", titleFields: ["subject", "title"], subtitleFields: ["ticketNumber", "clientName", "priority"], statusField: "status", dateFields: ["createdAt"] },
    ],
  },
  marketing: {
    key: "marketing",
    label: "التسويق",
    sections: [
      { key: "campaigns", label: "الحملات", icon: "megaphone-outline", endpoint: "/api/marketing/campaigns", titleFields: ["name", "title"], statusField: "status", amountFields: ["budget"], dateFields: ["startDate"] },
    ],
  },
  property: {
    key: "property",
    label: "العقارات",
    sections: [
      { key: "units", label: "الوحدات العقارية", icon: "home-outline", endpoint: "/api/properties/units", titleFields: ["unitNumber", "name"], subtitleFields: ["buildingName", "type"], statusField: "status" },
      { key: "contracts", label: "عقود الإيجار", icon: "document-text-outline", endpoint: "/api/properties/contracts", titleFields: ["contractNumber", "ref"], subtitleFields: ["tenantName", "clientName"], statusField: "status", amountFields: ["totalAmount", "total"], dateFields: ["startDate"] },
    ],
  },
  legal: {
    key: "legal",
    label: "الشؤون القانونية",
    sections: [
      { key: "cases", label: "القضايا", icon: "hammer-outline", endpoint: "/api/legal/cases", titleFields: ["title", "caseNumber"], subtitleFields: ["court", "caseNumber"], statusField: "status", dateFields: ["filingDate"] },
      { key: "contracts", label: "العقود القانونية", icon: "document-text-outline", endpoint: "/api/legal/contracts", titleFields: ["title", "contractNumber"], subtitleFields: ["contractNumber"], statusField: "status", dateFields: ["expiryDate"] },
    ],
  },
  requests: {
    key: "requests",
    label: "الطلبات",
    sections: [
      { key: "requests", label: "الطلبات", icon: "file-tray-full-outline", endpoint: "/api/requests", titleFields: ["ref", "type", "title"], subtitleFields: ["requesterName", "type"], statusField: "status", dateFields: ["createdAt"] },
    ],
  },
  governance: {
    key: "governance",
    label: "الحوكمة",
    sections: [
      { key: "policies", label: "السياسات", icon: "ribbon-outline", endpoint: "/api/governance/policies", titleFields: ["title", "name"], subtitleFields: ["version"], statusField: "status", dateFields: ["effectiveDate"] },
    ],
  },
  bi: {
    key: "bi",
    label: "تحليلات الأعمال",
    sections: [
      { key: "reports", label: "التقارير التحليلية", icon: "analytics-outline", endpoint: "/api/bi/reports", titleFields: ["name", "title"], subtitleFields: ["category"], dateFields: ["lastRun"] },
    ],
  },
  reports: {
    key: "reports",
    label: "التقارير",
    sections: [
      { key: "reports", label: "التقارير", icon: "bar-chart-outline", endpoint: "/api/bi/reports", titleFields: ["name", "title"], subtitleFields: ["category"], dateFields: ["lastRun"] },
    ],
  },
  admin: {
    key: "admin",
    label: "إدارة النظام",
    sections: [
      { key: "users", label: "المستخدمون", icon: "person-circle-outline", endpoint: "/api/admin/users", titleFields: ["name", "fullName", "email"], subtitleFields: ["email", "role"], statusField: "status" },
    ],
  },
  settings: {
    key: "settings",
    label: "الإعدادات",
    sections: [
      { key: "branches", label: "الفروع", icon: "git-network-outline", endpoint: "/api/settings/branches", titleFields: ["name", "branchName"], subtitleFields: ["code"], statusField: "status" },
    ],
  },
};

export function getModuleDef(key: string | undefined | null): ModuleDef | undefined {
  if (!key) return undefined;
  return MODULE_SECTIONS[key];
}

export function getSection(moduleKey: string, sectionKey: string): ModuleSection | undefined {
  return MODULE_SECTIONS[moduleKey]?.sections.find((s) => s.key === sectionKey);
}

/** Module keys that now have native screens (drives `built` flags in modules.ts). */
export const NATIVE_MODULE_KEYS = Object.keys(MODULE_SECTIONS);

// ─── Field extraction ───────────────────────────────────────────────────────

export function pickField(row: Record<string, unknown>, fields?: string[]): string | null {
  if (!fields) return null;
  for (const f of fields) {
    const v = row[f];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return null;
}

// ─── Status → Arabic label + tone ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  active: { label: "نشط", tone: "success" },
  inactive: { label: "غير نشط", tone: "default" },
  suspended: { label: "موقوف", tone: "danger" },
  pending: { label: "معلّق", tone: "warning" },
  approved: { label: "معتمد", tone: "success" },
  rejected: { label: "مرفوض", tone: "danger" },
  cancelled: { label: "ملغي", tone: "default" },
  canceled: { label: "ملغي", tone: "default" },
  draft: { label: "مسودة", tone: "default" },
  posted: { label: "مرحّل", tone: "success" },
  reversed: { label: "معكوس", tone: "danger" },
  paid: { label: "مدفوع", tone: "success" },
  unpaid: { label: "غير مدفوع", tone: "warning" },
  partial: { label: "مدفوع جزئيًا", tone: "warning" },
  overdue: { label: "متأخر", tone: "danger" },
  open: { label: "مفتوح", tone: "info" },
  closed: { label: "مغلق", tone: "default" },
  in_progress: { label: "قيد التنفيذ", tone: "info" },
  inprogress: { label: "قيد التنفيذ", tone: "info" },
  resolved: { label: "تم الحل", tone: "success" },
  completed: { label: "مكتمل", tone: "success" },
  new: { label: "جديد", tone: "info" },
  won: { label: "ناجحة", tone: "success" },
  lost: { label: "خاسرة", tone: "danger" },
  expired: { label: "منتهٍ", tone: "danger" },
  available: { label: "متاح", tone: "success" },
  occupied: { label: "مشغول", tone: "warning" },
  maintenance: { label: "صيانة", tone: "warning" },
  scheduled: { label: "مجدول", tone: "info" },
};

export function statusBadge(raw: string | null): { label: string; tone: Tone } | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return STATUS_MAP[key] ?? { label: raw, tone: "info" };
}
