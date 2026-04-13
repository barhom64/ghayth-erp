import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, apiPatch, apiDelete } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, GitBranch, TrendingUp, TrendingDown, Layers, BookOpen, ChevronDown, ChevronRight, CheckCircle, Search, Edit2, Trash2, Printer, Download } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useToast } from "@/hooks/use-toast";

const typeMap: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات"
};
const typeColors: Record<string, string> = {
  asset: "bg-blue-100 text-blue-700",
  liability: "bg-red-100 text-red-700",
  equity: "bg-purple-100 text-purple-700",
  revenue: "bg-green-100 text-green-700",
  expense: "bg-orange-100 text-orange-700",
};

function AccountNode({ node, level = 0, highlightIds, onEdit, onDelete }: { node: any; level?: number; highlightIds?: Set<number>; onEdit: (acc: any) => void; onDelete: (acc: any) => void }) {
  const [expanded, setExpanded] = useState(highlightIds ? highlightIds.has(node.id) || level < 1 : level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isMatch = highlightIds?.has(node.id) && node._matched;

  return (
    <div>
      <div
        className={`flex items-center gap-2 p-3 hover:bg-gray-50 border-b transition-colors text-sm group ${level > 0 ? "bg-gray-50/30" : ""} ${isMatch ? "bg-yellow-50/60 ring-1 ring-inset ring-yellow-200" : ""}`}
        style={{ paddingInlineEnd: `${12 + level * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <span className="font-mono text-blue-600 text-xs w-16 flex-shrink-0">{node.code}</span>

        <Link href={`/finance/ledger/${node.code}`}>
          <span className="font-medium text-gray-900 hover:text-blue-600 cursor-pointer flex-1 min-w-0 truncate">
            {node.name}
            {node.nameEn && <span className="text-gray-400 text-xs ms-2 font-normal">{node.nameEn}</span>}
          </span>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge className={`${typeColors[node.type] || ""} text-xs`}>{typeMap[node.type] || node.type}</Badge>

          {node.isAnalytical && (
            <Badge className="bg-indigo-100 text-indigo-700 text-xs">تحليلي</Badge>
          )}

          {!node.allowPosting ? (
            <Badge className="bg-gray-100 text-gray-500 text-xs">تجميعي</Badge>
          ) : (
            <Badge className="bg-green-50 text-green-600 text-xs">يقبل حركة</Badge>
          )}

          {node.isActive === false && (
            <Badge className="bg-red-100 text-red-600 text-xs">غير نشط</Badge>
          )}

          {node.costCenter && (
            <span className="text-xs text-gray-400 hidden lg:inline">م.تكلفة: {node.costCenter}</span>
          )}

          <span className={`font-semibold text-sm w-28 text-start ${Number(node.balance || node.currentBalance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(Number(node.balance || node.currentBalance || 0))}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600" title="تعديل">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(node)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600" title="حذف">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {expanded && hasChildren && node.children.map((child: any) => (
        <AccountNode key={child.code} node={child} level={level + 1} highlightIds={highlightIds} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function AccountsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data, isLoading } = useApiQuery<any>(["accounts"], "/finance/accounts");
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [deleteAccount, setDeleteAccount] = useState<any>(null);
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const hasActiveSearch = !!(filters.search || filters.type);

  const filtered = applyFilters(items, filters, {
    searchFields: ["name", "code", "nameEn"],
    extraFields: { type: "type" },
  });

  const totalAccounts = items.length;
  const assetCount = items.filter((a: any) => a.type === "asset").length;
  const liabilityCount = items.filter((a: any) => a.type === "liability").length;
  const revenueCount = items.filter((a: any) => a.type === "revenue").length;
  const analyticalCount = items.filter((a: any) => a.isAnalytical).length;

  const { tree, highlightIds } = useMemo(() => {
    if (!hasActiveSearch) {
      const map = new Map<number, any>();
      items.forEach((a: any) => map.set(a.id, { ...a, children: [] }));
      const roots: any[] = [];
      items.forEach((a: any) => {
        const node = map.get(a.id);
        if (a.parentId && map.has(a.parentId)) {
          map.get(a.parentId).children.push(node);
        } else {
          roots.push(node);
        }
      });
      return { tree: roots, highlightIds: undefined };
    }

    const matchedIds = new Set<number>(filtered.map((a: any) => a.id));
    const ancestorIds = new Set<number>();
    const idToAccount = new Map<number, any>();
    items.forEach((a: any) => idToAccount.set(a.id, a));

    for (const id of matchedIds) {
      let current = idToAccount.get(id);
      while (current?.parentId) {
        if (ancestorIds.has(current.parentId)) break;
        ancestorIds.add(current.parentId);
        current = idToAccount.get(current.parentId);
      }
    }

    const visibleIds = new Set<number>([...matchedIds, ...ancestorIds]);
    const visibleItems = items.filter((a: any) => visibleIds.has(a.id));

    const map = new Map<number, any>();
    visibleItems.forEach((a: any) => map.set(a.id, { ...a, children: [], _matched: matchedIds.has(a.id) }));
    const roots: any[] = [];
    visibleItems.forEach((a: any) => {
      const node = map.get(a.id);
      if (a.parentId && map.has(a.parentId)) {
        map.get(a.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const allHighlightIds = new Set<number>([...matchedIds, ...ancestorIds]);
    return { tree: roots, highlightIds: allHighlightIds };
  }, [items, filtered, hasActiveSearch]);

  const sortedFlat = [...filtered].sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));

  const handleOpenEdit = (acc: any) => {
    navigate(`/finance/accounts/${acc.id}/edit`);
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    setSaving(true);
    try {
      setDeleteError("");
      await apiDelete(`/finance/accounts/${deleteAccount.id}`);
      toast({ title: "تم حذف الحساب" });
      setDeleteAccount(null);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      setDeleteError(err?.message || "لا يمكن حذف هذا الحساب");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">شجرة الحسابات</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 me-1" />طباعة
          </Button>
          <Button size="sm" variant={viewMode === "tree" ? "default" : "outline"} onClick={() => setViewMode("tree")}>
            <GitBranch className="h-4 w-4 me-1" />شجري
          </Button>
          <Button size="sm" variant={viewMode === "flat" ? "default" : "outline"} onClick={() => setViewMode("flat")}>
            <Layers className="h-4 w-4 me-1" />مسطح
          </Button>
          <Link href="/finance/accounts/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة حساب</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Layers className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي الحسابات</p><p className="text-xl font-bold">{formatNumber(totalAccounts)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
          <div><p className="text-xs text-gray-500">الأصول</p><p className="text-xl font-bold text-blue-600">{formatNumber(assetCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          <div><p className="text-xs text-gray-500">الخصوم</p><p className="text-xl font-bold text-red-600">{formatNumber(liabilityCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><BookOpen className="h-5 w-5 text-green-500" /></div>
          <div><p className="text-xs text-gray-500">الإيرادات</p><p className="text-xl font-bold text-green-600">{formatNumber(revenueCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg"><CheckCircle className="h-5 w-5 text-indigo-500" /></div>
          <div><p className="text-xs text-gray-500">تحليلية</p><p className="text-xl font-bold text-indigo-600">{formatNumber(analyticalCount)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الرمز أو النوع...",
          extraFilters: [
            {
              key: "type",
              label: "النوع",
              options: Object.entries(typeMap).map(([k, v]) => ({ value: k, label: v })),
            },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedFlat || []) as any[], [
          { key: "code", label: "الرمز" },
          { key: "name", label: "الاسم" },
          { key: "nameEn", label: "الاسم (إنجليزي)" },
          { key: "type", label: "النوع" },
          { key: "level", label: "المستوى" },
          { key: "allowPosting", label: "يقبل حركة" },
          { key: "isAnalytical", label: "تحليلي" },
          { key: "costCenter", label: "مركز التكلفة" },
          { key: "isActive", label: "نشط" },
          { key: "currentBalance", label: "الرصيد الحالي" },
        ], "شجرة_الحسابات")}
        resultCount={filtered?.length}
      />

      {hasActiveSearch && filtered.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-yellow-600" />
          <span>تم العثور على <strong className="text-gray-700">{filtered.length}</strong> حساب مطابق — يتم عرض الحسابات الأصلية للحفاظ على التسلسل الشجري</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد حسابات</p>
            </div>
          ) : viewMode === "tree" ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b text-xs text-gray-500 font-medium">
                <span className="w-4" />
                <span className="w-16">الرمز</span>
                <span className="flex-1">الاسم</span>
                <span className="w-20 text-center">النوع</span>
                <span className="w-16 text-center">فرعي</span>
                <span className="w-16 text-center">نشاط</span>
                <span className="w-28 text-start">الرصيد</span>
                <span className="w-16" />
              </div>
              <div>{tree.map((node: any) => <AccountNode key={node.code || node.id} node={node} level={0} highlightIds={highlightIds} onEdit={handleOpenEdit} onDelete={setDeleteAccount} />)}</div>
            </>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3 text-start text-xs text-gray-500">الرمز</th>
                  <th className="p-3 text-start text-xs text-gray-500">الاسم</th>
                  <th className="p-3 text-start text-xs text-gray-500">النوع</th>
                  <th className="p-3 text-start text-xs text-gray-500">المستوى</th>
                  <th className="p-3 text-start text-xs text-gray-500">يقبل حركة</th>
                  <th className="p-3 text-start text-xs text-gray-500">تحليلي</th>
                  <th className="p-3 text-start text-xs text-gray-500">الحالة</th>
                  <th className="p-3 text-start text-xs text-gray-500">الرصيد</th>
                  <th className="p-3 text-start text-xs text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortedFlat.map((acc: any) => (
                  <tr key={acc.id || acc.code} className="border-b hover:bg-gray-50 group">
                    <td className="p-3 font-mono text-blue-600 text-xs">{acc.code}</td>
                    <td className="p-3 font-medium">
                      <Link href={`/finance/ledger/${acc.code}`}>
                        <span className="hover:text-blue-600 cursor-pointer">{acc.name}</span>
                      </Link>
                      {acc.nameEn && <div className="text-xs text-gray-400">{acc.nameEn}</div>}
                    </td>
                    <td className="p-3"><Badge className={`${typeColors[acc.type] || ""} text-xs`}>{typeMap[acc.type] || acc.type}</Badge></td>
                    <td className="p-3 text-center text-gray-600">{acc.level}</td>
                    <td className="p-3 text-center">{acc.allowPosting ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : "-"}</td>
                    <td className="p-3 text-center">{acc.isAnalytical ? <CheckCircle className="h-4 w-4 text-indigo-500 mx-auto" /> : "-"}</td>
                    <td className="p-3">{acc.isActive !== false ? <Badge className="bg-green-50 text-green-700 text-xs">نشط</Badge> : <Badge className="bg-red-50 text-red-700 text-xs">موقوف</Badge>}</td>
                    <td className={`p-3 font-semibold text-sm ${Number(acc.currentBalance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(Number(acc.currentBalance || 0))}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenEdit(acc)} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteAccount(acc)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>


      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) { setDeleteAccount(null); setDeleteError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الحساب — {deleteAccount?.code} {deleteAccount?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ? (
                <span className="text-red-600 font-medium">{deleteError}</span>
              ) : (
                "هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteAccount(null); setDeleteError(""); }}>إلغاء</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                {saving ? "جاري الحذف..." : "حذف"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
