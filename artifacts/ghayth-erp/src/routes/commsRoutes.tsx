import { lazy } from "react";

const Communications = lazy(() => import("@/pages/communications"));
const NotificationEngine = lazy(() => import("@/pages/notification-engine"));

export const commsRoutes = [
  { path: "/communications", component: Communications },
  { path: "/communications/notification-engine", component: NotificationEngine },
];
