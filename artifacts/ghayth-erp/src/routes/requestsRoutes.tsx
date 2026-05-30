import { lazy } from "react";

const RequestsPage = lazy(() => import("@/pages/requests-page"));
const RequestDetail = lazy(() => import("@/pages/details/request-detail"));

export const requestsRoutes = [
  { path: "/requests", component: RequestsPage },
  { path: "/requests/types", component: RequestsPage },
  { path: "/requests/workflows", component: RequestsPage },
  { path: "/requests/:id", component: RequestDetail },
];
