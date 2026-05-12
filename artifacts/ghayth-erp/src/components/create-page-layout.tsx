import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatDateAr } from "@/lib/formatters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// Phase A — CreatePageLayout now delegates to PageShell so every one of
// the 56+ create pages in the app automatically picks up the unified
// header + breadcrumbs + error boundary without touching the call sites.
// This is the single-point leverage move: update one component, every
// create page looks consistent.
import { PageShell } from "@/components/page-shell";

interface CreatePageLayoutProps {
  title: string;
  backPath: string;
  /**
   * Optional label for the back link shown in the breadcrumbs. Defaults to
   * "رجوع" — most call sites are fine with the default because the title
   * on the parent page already tells the user where they came from.
   */
  backLabel?: string;
  /**
   * Optional subtitle shown under the page title. Create pages that don't
   * need one (most) leave it blank and the header renders title alone.
   */
  subtitle?: string;
  /**
   * Optional extra breadcrumbs between Home and the back link. Useful for
   * deeper create flows like /create/hr/employee where the parent is
   * "الموارد البشرية → الموظفون → إضافة موظف".
   */
  breadcrumbs?: Array<{ href?: string; label: string }>;
  children: React.ReactNode;
  isDirty?: boolean;
}

export function CreatePageLayout({
  title,
  backPath,
  backLabel,
  subtitle,
  breadcrumbs,
  children,
  isDirty = false,
}: CreatePageLayoutProps) {
  const [, setLocation] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  useUnsavedChanges(isDirty);

  const handleBack = () => {
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    setLocation(backPath);
  };

  const allCrumbs = [
    ...(breadcrumbs ?? []),
    { href: backPath, label: backLabel ?? "رجوع" },
  ];

  return (
    <>
      <PageShell
        title={title}
        subtitle={subtitle}
        breadcrumbs={allCrumbs}
        actions={
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </PageShell>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغييرات غير محفوظة</AlertDialogTitle>
            <AlertDialogDescription>
              لديك تغييرات لم تُحفظ بعد. هل تريد المغادرة وتجاهل التعديلات؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>البقاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => setLocation(backPath)}>
              مغادرة وتجاهل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface AutoFieldProps {
  label: string;
  value: string;
}

export function AutoField({ label, value }: AutoFieldProps) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1 px-3 py-2 border rounded-md bg-muted text-muted-foreground text-sm">
        {value}
      </div>
    </div>
  );
}

export function CreationDateField() {
  return <AutoField label="تاريخ الإنشاء" value={formatDateAr(new Date())} />;
}
