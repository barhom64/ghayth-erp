import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Database, Layers, Cog, Shield, Calendar, BookOpen,
} from "lucide-react";

export default function AdminDomainRegistry() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["domain-registry"], "/admin/governance/domain-registry"
  );

  const domains = data?.domains ?? [];
  const stats = data?.stats ?? {};

  return (
    <PageShell
      title="سجل النطاقات"
      subtitle="خريطة كاملة لكل نطاق في النظام — الجداول والمحركات والصلاحيات"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalDomains ?? domains.length}</p>
                <p className="text-xs text-muted-foreground">نطاق</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalTables ?? 0}</p>
                <p className="text-xs text-muted-foreground">جدول</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalEngines ?? 0}</p>
                <p className="text-xs text-muted-foreground">محرك</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalPermissions ?? 0}</p>
                <p className="text-xs text-muted-foreground">صلاحية</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.domainsWithGL ?? 0}</p>
                <p className="text-xs text-muted-foreground">مع ربط مالي</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {domains.map((domain: any) => (
              <Card key={domain.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    {domain.label}
                    <Badge variant="outline" className="font-mono text-xs">{domain.id}</Badge>
                    {domain.glIntegration && <Badge className="bg-status-success-surface text-status-success-foreground">GL</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="font-medium flex items-center gap-1 mb-1">
                        <Database className="w-3 h-3" /> الجداول ({domain.tables?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(domain.tables || []).map((t: string) => (
                          <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="font-medium flex items-center gap-1 mb-1">
                        <Cog className="w-3 h-3" /> المحركات ({domain.engines?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(domain.engines || []).map((e: string) => (
                          <Badge key={e} className="bg-status-info-surface text-status-info-foreground text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="font-medium flex items-center gap-1 mb-1">
                        <Shield className="w-3 h-3" /> الصلاحيات ({domain.permissions?.length || 0})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(domain.permissions || []).map((p: string) => (
                          <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    </div>

                    {domain.lifecycleEntities?.length > 0 && (
                      <div>
                        <p className="font-medium flex items-center gap-1 mb-1">
                          <BookOpen className="w-3 h-3" /> كيانات دورة الحياة
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {domain.lifecycleEntities.map((e: string) => (
                            <Badge key={e} className="bg-purple-100 text-purple-800 text-[10px]">{e}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {domain.cronJobs?.length > 0 && (
                      <div>
                        <p className="font-medium flex items-center gap-1 mb-1">
                          <Calendar className="w-3 h-3" /> المهام المجدولة
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {domain.cronJobs.map((c: string) => (
                            <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {domain.obligationTypes?.length > 0 && (
                      <div>
                        <p className="font-medium mb-1">الالتزامات</p>
                        <div className="flex flex-wrap gap-1">
                          {domain.obligationTypes.map((o: string) => (
                            <Badge key={o} className="bg-status-warning-surface text-status-warning-foreground text-[10px]">{o}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
