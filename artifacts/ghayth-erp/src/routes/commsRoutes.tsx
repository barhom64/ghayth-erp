import { lazy } from "react";

const Communications = lazy(() => import("@/pages/communications"));
const Inbox = lazy(() => import("@/pages/inbox"));
const Mailboxes = lazy(() => import("@/pages/mailboxes"));
const CompanyEmail = lazy(() => import("@/pages/company-email"));
const NotificationEngine = lazy(() => import("@/pages/notification-engine"));
const Correspondence = lazy(() => import("@/pages/comms/correspondence"));
const CorrespondenceCreate = lazy(() => import("@/pages/create/comms/correspondence-create"));
const CorrespondenceDetail = lazy(() => import("@/pages/details/correspondence-detail"));

export const commsRoutes = [
  { path: "/inbox", component: Inbox },
  { path: "/mailboxes", component: Mailboxes },
  { path: "/company-email", component: CompanyEmail },
  { path: "/communications", component: Communications },
  { path: "/communications/notification-engine", component: NotificationEngine },
  { path: "/correspondence", component: Correspondence },
  { path: "/correspondence/create", component: CorrespondenceCreate },
  { path: "/correspondence/:id", component: CorrespondenceDetail },
];
