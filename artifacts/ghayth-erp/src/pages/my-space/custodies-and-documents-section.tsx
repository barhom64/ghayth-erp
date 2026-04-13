import { Link } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyRound, FileText, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabels } from "./shared";

interface CustodiesAndDocumentsSectionProps {
  custodies: any[];
  documents: any[];
}

export function CustodiesAndDocumentsSection({ custodies, documents }: CustodiesAndDocumentsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            العُهد المسلمة لي
            {custodies.length > 0 && <Badge className="text-xs bg-indigo-100 text-indigo-700">{custodies.length}</Badge>}
          </CardTitle>
          <Link href="/finance/custodies">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {custodies.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">لا توجد عُهد</p>
          ) : (
            <div className="space-y-2">
              {custodies.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.description || `عهدة #${c.id}`}</p>
                    <p className="text-xs text-gray-400">{Number(c.amount).toLocaleString("ar-SA")} ر.س</p>
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", statusLabels[c.status]?.color || "bg-gray-100 text-gray-700")}>
                    {statusLabels[c.status]?.label || c.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-500" />
            مستنداتي
            {documents.length > 0 && <Badge className="text-xs bg-cyan-100 text-cyan-700">{documents.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">لا توجد مستندات</p>
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{d.name || d.type}</p>
                      <p className="text-xs text-gray-400">{d.type}</p>
                    </div>
                  </div>
                  {d.expiryDate && (
                    <span className={cn("text-xs shrink-0",
                      new Date(d.expiryDate) < new Date() ? "text-red-500" : "text-gray-400"
                    )}>
                      ينتهي: {formatDateAr(d.expiryDate)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
