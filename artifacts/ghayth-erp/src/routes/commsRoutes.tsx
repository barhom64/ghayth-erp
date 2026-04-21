import { lazy } from "react";

const Communications = lazy(() => import("@/pages/communications"));
const NotificationEngine = lazy(() => import("@/pages/notification-engine"));
const Correspondence = lazy(() => import("@/pages/comms/correspondence"));
const CorrespondenceCreate = lazy(() => import("@/pages/create/comms/correspondence-create"));

export const commsRoutes = [
  { path: "/communications", component: Communications },
  { path: "/communications/notification-engine", component: NotificationEngine },
  { path: "/correspondence", component: Correspondence },
  { path: "/correspondence/create", component: CorrespondenceCreate },
];
