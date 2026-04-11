import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UmrahAgents() {
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const items = resp?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const save = async () => {
    try {
      await apiFetch("/umrah/agents", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إضافة الوكيل" });
      setShowForm(false);
      setForm({});
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ" }); }
  };

  const activeCount = items.filter((a: any) => a.status === "active").length;
  const kpiCards = [
    { label: "إجمالي الوكلاء", value: items.length, icon: Building2, color: "text-blue-600 bg-blue-50" },
    { label: "وكلاء نشطون", value: activeCount, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "وكلاء موقوفون", value: items.length - activeCount, icon: Building2, color: "text-red-600 bg-red-50" },
  ];

  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الوكلاء</h1>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />إضافة وكيل</Button>
      </div>

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>الاسم *</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>الشخص المسؤول</Label><Input value={form.contactPerson || ""} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>الهاتف</Label><Input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>البريد</Label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>البلد</Label><Input value={form.country || ""} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            <div><Label>نسبة الربح %</Label><Input type="number" value={form.profitMargin || ""} onChange={e => setForm({ ...form, profitMargin: e.target.value })} /></div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={save} disabled={!form.name}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-start">الاسم</TableHead>
            <TableHead className="text-start">البلد</TableHead>
            <TableHead className="text-start">الهاتف</TableHead>
            <TableHead className="text-start">نسبة الربح</TableHead>
            <TableHead className="text-start">الحالة</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={items}
            colCount={5}
            emptyMessage="لا يوجد وكلاء"
            emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
          >
            {paginatedItems.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.country}</TableCell>
                <TableCell>{a.phone}</TableCell>
                <TableCell>{a.profitMargin}%</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={items.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
