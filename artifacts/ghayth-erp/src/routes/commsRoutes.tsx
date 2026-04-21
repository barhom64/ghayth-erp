import { lazy } from "react";

const Communications = lazy(() => import("@/pages/communications"));
const NotificationEngine = lazy(() => import("@/pages/notification-engine"));
const Correspondence = lazy(() => import("@/pages/comms/correspondence"));
const CorrespondenceCreate = lazy(() => import("@/pages/create/comms/correspondence-create"));
const LettersCreate = lazy(() => import("@/pages/create/communications/letters-create"));
const CorrespondenceDetail = lazy(() => import("@/pages/details/correspondence-detail"));

export const commsRoutes = [
  { path: "/communications", component: Communications },
  { path: "/communications/notification-engine", component: NotificationEngine },
  { path: "/communications/letters/create", component: LettersCreate },
  { path: "/correspondence", component: Correspondence },
  { path: "/correspondence/create", component: CorrespondenceCreate },
  { path: "/correspondence/:id", component: CorrespondenceDetail },
];
