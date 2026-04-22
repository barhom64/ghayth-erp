import { lazy } from "react";

const RequestsPage = lazy(() => import("@/pages/requests-page"));
const RequestsItemCreate = lazy(() => import("@/pages/create/requests/items-create"));
const RequestsTypeCreate = lazy(() => import("@/pages/create/requests/types-create"));
const RequestDetail = lazy(() => import("@/pages/details/request-detail"));

export const requestsRoutes = [
  { path: "/requests", component: RequestsPage },
  { path: "/requests/create", component: RequestsItemCreate },
  { path: "/requests/types", component: RequestsPage },
  { path: "/requests/types/create", component: RequestsTypeCreate },
  { path: "/requests/workflows", component: RequestsPage },
  { path: "/requests/:id", component: RequestDetail },
];
