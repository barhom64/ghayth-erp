import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

const DocumentsPage = lazy(() => import("@/pages/documents-page"));
const DocumentsCreate = lazy(() => import("@/pages/create/documents/documents-create"));
const VersionUpload = lazy(() => import("@/pages/create/documents/version-upload"));
const DocumentsUpload = lazy(() => import("@/pages/documents/documents-upload"));
const DocumentsArchive = lazy(() => import("@/pages/documents/archive"));
const DocumentsTemplates = lazy(() => import("@/pages/documents/templates"));
// قراءة المستندات (OCR) موحّدة في صفحة واحدة (ocr-review): رفع + قراءة + مراجعة +
// تأكيد. صندوق المسح الضوئي القديم (documents-ocr-inbox) كان نسخة أضعف (بلا رفع ولا
// تطبيق على كيان) → يُحوَّل redirect إلى الصفحة الموحّدة (الملف مُبقًى، تحويل لا حذف).
const DocumentsOcrReview = lazy(() => import("@/pages/documents/ocr-review"));

export const documentsRoutes = [
  { path: "/documents", component: DocumentsPage },
  { path: "/documents/create", component: DocumentsCreate },
  { path: "/documents/:docId/versions", component: VersionUpload },
  { path: "/documents/upload", component: DocumentsUpload },
  { path: "/documents/folders", component: DocumentsPage },
  { path: "/documents/templates", component: DocumentsTemplates },
  { path: "/documents/archive", component: DocumentsArchive },
  { path: "/documents/ocr-inbox", component: redirectTo("/documents/ocr/review") },
  { path: "/documents/ocr/review", component: DocumentsOcrReview },
];
