import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Package, Check, X } from "lucide-react";

interface UmrahPackage {
  id: number;
  name?: string;
  seasonTitle?: string;
  costPrice?: number;
  sellPrice?: number;
  duration?: number;
  description?: string;
  includesTransport?: boolean;
  includesHotel?: boolean;
  includesMeals?: boolean;
  includesZiyarat?: boolean;
  status?: string;
}

const BoolIcon = ({ v }: { v?: boolean }) => v ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />;

const columns: DataTableColumn<UmrahPackage>[] = [
  { key: "name", header: "اسم الباقة", sortable: true, searchable: true },
  { key: "seasonTitle", header: "الموسم" },
  { key: "duration", header: "المدة (أيام)" },
  { key: "costPrice", header: "سعر التكلفة", render: (r) => r.costPrice ? `${Number(r.costPrice).toLocaleString("ar-SA")} ر.س` : "-" },
  { key: "sellPrice", header: "سعر البيع", render: (r) => r.sellPrice ? `${Number(r.sellPrice).toLocaleString("ar-SA")} ر.س` : "-" },
  { key: "includesTransport", header: "نقل", align: "center", render: (r) => <BoolIcon v={r.includesTransport} /> },
  { key: "includesHotel", header: "فندق", align: "center", render: (r) => <BoolIcon v={r.includesHotel} /> },
  { key: "includesMeals", header: "وجبات", align: "center", render: (r) => <BoolIcon v={r.includesMeals} /> },
  { key: "includesZiyarat", header: "زيارات", align: "center", render: (r) => <BoolIcon v={r.includesZiyarat} /> },
  {
    key: "status", header: "الحالة", render: (r) => {
      const v = r.status;
      return <Badge className={v === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>{v === "active" ? "نشطة" : v === "inactive" ? "غير نشطة" : v || "-"}</Badge>;
    }
  },
];

export default function UmrahPackages() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["umrah-packages"], "/umrah/packages");
  const rows = asList(data?.data || data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> باقات العمرة</h1>
        <p className="text-muted-foreground mt-1">إدارة باقات العمرة والأسعار والتفاصيل</p>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </div>
  );
}
