import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatDateAr } from "@/lib/formatters";

interface CreatePageLayoutProps {
  title: string;
  backPath: string;
  children: React.ReactNode;
  isDirty?: boolean;
}

export function CreatePageLayout({ title, backPath, children, isDirty = false }: CreatePageLayoutProps) {
  const [, setLocation] = useLocation();
  useUnsavedChanges(isDirty);

  const handleBack = () => {
    if (isDirty) {
      const confirmed = window.confirm("لديك تغييرات غير محفوظة. هل تريد المغادرة؟");
      if (!confirmed) return;
    }
    setLocation(backPath);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
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
