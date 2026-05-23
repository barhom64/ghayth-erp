import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  RefreshCw, GitBranch, ArrowRight,
} from "lucide-react";

export default function AdminLifecycleMonitor() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["lifecycle-machines"], "/admin/governance/lifecycle-machines"
  );
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const machines = data?.machines ?? [];
  const selectedMachine = machines.find((m: any) => m.entity === selectedEntity);

  return (
    <PageShell
      title="محرك دورة الحياة"
      subtitle="آلات الحالة (State Machines) لجميع كيانات النظام"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{machines.length}</p>
                <p className="text-xs text-muted-foreground">آلة حالة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {machines.reduce((acc: number, m: any) => acc + Object.keys(m.transitions || {}).length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">حالة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {machines.reduce((acc: number, m: any) =>
                    acc + (Object.values(m.transitions || {}) as string[][]).reduce((s: number, t: string[]) => s + t.length, 0), 0
                  )}
                </p>
                <p className="text-xs text-muted-foreground">انتقال</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {machines.filter((m: any) => {
                    const t = m.transitions || {};
                    return Object.values(t).some((v: any) => (v as string[]).length === 0);
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">كيان بحالات نهائية</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  الكيانات
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-auto">
                  {machines.map((m: any) => (
                    <button
                      key={m.entity}
                      className={`w-full text-start p-3 border-b hover:bg-surface-subtle flex items-center justify-between ${selectedEntity === m.entity ? "bg-primary/5 border-r-2 border-r-primary" : ""}`}
                      onClick={() => setSelectedEntity(m.entity)}
                    >
                      <div>
                        <p className="font-medium text-sm">{m.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{m.entity}</p>
                      </div>
                      <Badge variant="outline">{Object.keys(m.transitions || {}).length} حالة</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">
                  {selectedMachine ? (
                    <span className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      {selectedMachine.label}
                      <Badge variant="outline" className="font-mono">{selectedMachine.entity}</Badge>
                    </span>
                  ) : "اختر كياناً لعرض مخطط الحالة"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedMachine ? (
                  <div className="space-y-3">
                    {Object.entries(selectedMachine.transitions as Record<string, string[]>).map(([state, targets]) => {
                      const isTerminal = targets.length === 0;
                      return (
                        <div key={state} className={`p-3 rounded border ${isTerminal ? "bg-surface-subtle border-border" : "bg-white"}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={isTerminal ? "bg-gray-200 text-status-neutral-foreground" : "bg-status-info-surface text-status-info-foreground"}>
                              {state}
                            </Badge>
                            {isTerminal && <span className="text-xs text-muted-foreground">(حالة نهائية)</span>}
                          </div>
                          {targets.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              {targets.map((target) => (
                                <div key={target} className="flex items-center gap-1">
                                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                  <Badge variant="outline">{target}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>اختر كياناً من القائمة لعرض انتقالات الحالة</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
