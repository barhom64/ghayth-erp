import { lazy } from "react";

const Settings = lazy(() => import("@/pages/settings"));
const SettingsRules = lazy(() => import("@/pages/settings-rules"));

export const settingsRoutes = [
  { path: "/settings", component: Settings },
  { path: "/settings/branches", component: Settings },
  { path: "/settings/departments", component: Settings },
  { path: "/settings/companies", component: Settings },
  { path: "/settings/audit-log", component: Settings },
  { path: "/settings/rules", component: SettingsRules },
];
