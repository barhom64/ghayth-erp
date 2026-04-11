import { Link, useLocation } from "wouter";
import { ChevronLeft, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "لوحة القيادة",
  "/employees": "الموظفين",
  "/clients": "العملاء",
  "/hr": "الموارد البشرية",
  "/finance": "المالية",
  "/tasks": "المهام",
  "/notifications": "الإشعارات",
  "/fleet": "الأسطول",
  "/warehouse": "المستودعات",
  "/properties": "العقارات",
  "/projects": "المشاريع",
  "/legal": "القانونية",
  "/crm": "إدارة العملاء",
  "/support": "الدعم الفني",
  "/communications": "الاتصالات",
  "/intelligence": "الذكاء",
  "/automation": "الأتمتة",
};

export function Breadcrumbs() {
  const [location] = useLocation();
  const segments = location.split("/").filter(Boolean);

  if (segments.length === 0 || location === "/dashboard") {
    return (
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <Home className="h-4 w-4" />
        <span className="font-medium text-foreground">لوحة القيادة</span>
      </nav>
    );
  }

  const basePath = `/${segments[0]}`;
  const baseLabel = ROUTE_LABELS[basePath] || segments[0];

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href="/dashboard" className="hover:text-foreground transition-colors flex items-center gap-1">
        <Home className="h-4 w-4" />
        <span>الرئيسية</span>
      </Link>
      <ChevronLeft className="h-4 w-4" />
      {segments.length > 1 ? (
        <>
          <Link href={basePath} className="hover:text-foreground transition-colors">
            {baseLabel}
          </Link>
          <ChevronLeft className="h-4 w-4" />
          <span className="font-medium text-foreground">{segments[1]}</span>
        </>
      ) : (
        <span className="font-medium text-foreground">{baseLabel}</span>
      )}
    </nav>
  );
}
