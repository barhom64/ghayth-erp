import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { FileText, Download, Eye, Loader2, FolderOpen, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const docTypeLabels: Record<string, string> = {
  contract: "عقد عمل",
  offer_letter: "خطاب عرض",
  id_copy: "نسخة هوية",
  certificate: "شهادة",
  warning: "إنذار",
  appraisal: "تقييم",
  other: "مستند آخر",
};

export default function MyDocuments() {
  const { data, isLoading } = useApiQuery<any>(["my-documents"], "/my-space/documents");

  const documents: any[] = data?.data ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">مستنداتي</h1>
        <p className="text-gray-500 mt-1">المستندات والملفات المرتبطة بك</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <FolderOpen size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد مستندات</p>
            <p className="text-sm mt-1">المستندات المرتبطة بك ستظهر هنا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc: any) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{doc.title ?? doc.name ?? "مستند"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {docTypeLabels[doc.type] ?? doc.type ?? "مستند"} • {formatDateAr(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                  {doc.url && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(doc.url, "_blank")}
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        asChild
                      >
                        <a href={doc.url} download>
                          <Download size={14} />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
