import { Link } from "wouter";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyRound, FileText, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageStatusBadge } from "@/components/page-status-badge";

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
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد عُهد</p>
          ) : (
            <div className="space-y-2">
              {custodies.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-status-neutral-foreground truncate">{c.description || `عهدة #${c.id}`}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(Number(c.amount))}</p>
                  </div>
                  <PageStatusBadge status={c.status} domain="custody" className="text-[10px] shrink-0" />
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
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد مستندات</p>
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{d.name || d.type}</p>
                      <p className="text-xs text-muted-foreground">{d.type}</p>
                    </div>
                  </div>
                  {d.expiryDate && (
                    <span className={cn("text-xs shrink-0",
                      new Date(d.expiryDate) < new Date() ? "text-status-error" : "text-muted-foreground"
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
