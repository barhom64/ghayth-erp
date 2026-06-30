import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

const Settings = lazy(() => import("@/pages/settings"));
const SettingsRules = lazy(() => import("@/pages/settings-rules"));
const PartyProfile = lazy(() => import("@/pages/settings/party-profile"));

export const settingsRoutes = [
  { path: "/settings", component: Settings },
  // الملف الموحّد 360° لطرف (parties، هجرة 249) — صفحة تفصيلية تُفتح عبر رابط
  // «الملف الموحّد» من صفحات تفاصيل الكيانات (PartyProfileLink → /resolve).
  { path: "/settings/party/:id", component: PartyProfile },
  { path: "/settings/branches", component: Settings },
  { path: "/settings/letterhead", component: Settings },
  { path: "/settings/departments", component: Settings },
  { path: "/settings/companies", component: Settings },
  { path: "/settings/channels", component: Settings },
  { path: "/settings/controls", component: Settings },
  // «الإجراءات» (workflow_definitions) — dormant engine superseded by approval-chains;
  // its settings tab was removed, so this deep-path redirects to «الموافقات».
  { path: "/settings/workflows", component: redirectTo("/settings/approvals") },
  { path: "/settings/approvals", component: Settings },
  { path: "/settings/numbering", component: Settings },
  { path: "/settings/accounting", component: Settings },
  { path: "/settings/audit-log", component: Settings },
  { path: "/settings/resolved", component: Settings },
  { path: "/settings/zatca", component: Settings },
  { path: "/settings/gov", component: Settings },
  { path: "/settings/rules", component: SettingsRules },
  // GAP_MATRIX P1 — /admin/print-templates is canonical; redirect settings alias.
  { path: "/settings/print-templates", component: redirectTo("/admin/print-templates") },
];
