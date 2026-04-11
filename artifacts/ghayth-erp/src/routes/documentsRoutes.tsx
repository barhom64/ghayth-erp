import { lazy } from "react";

const DocumentsPage = lazy(() => import("@/pages/documents-page"));
const DocumentsCreate = lazy(() => import("@/pages/create/documents/documents-create"));
const VersionUpload = lazy(() => import("@/pages/create/documents/version-upload"));
const DocumentsUpload = lazy(() => import("@/pages/documents/documents-upload"));
const DocumentsArchive = lazy(() => import("@/pages/documents/archive"));
const DocumentsTemplates = lazy(() => import("@/pages/documents/templates"));

export const documentsRoutes = [
  { path: "/documents", component: DocumentsPage },
  { path: "/documents/create", component: DocumentsCreate },
  { path: "/documents/:docId/versions", component: VersionUpload },
  { path: "/documents/upload", component: DocumentsUpload },
  { path: "/documents/folders", component: DocumentsPage },
  { path: "/documents/templates", component: DocumentsTemplates },
  { path: "/documents/archive", component: DocumentsArchive },
];
