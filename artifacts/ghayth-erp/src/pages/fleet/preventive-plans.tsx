import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Plus, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const SERVICE_TYPES: Record<string, string> = {
  oil_change: "تغيير زيت",
  filter: "فلتر",
  tire_rotation: "دوران الإطارات",
  brake_check: "فحص الفرامل",
  battery: "بطارية",
  ac: "مكيف",
  full_service: "صيانة شاملة",
  other: "أخرى",
};

function getDueDays(nextDate?: string): number | null {
  if (!nextDate) return null;
  return Math.round((new Date(nextDate).getTime() - Date.now()) / (24 * 3600 * 1000));
}

export default function PreventivePlansPage() {
  const [showForm, setShowForm] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [form, setForm] = useState({
    vehicleId: "", serviceType: "oil_change",
    intervalKm: "", intervalDays: "",
    lastServiceDate: "", lastServiceMileage: "",
    nextServiceDate: "", estimatedCost: "", notes: "",
  });

  const { data, refetch } = useApiQuery<any>(
    ["preventive-plans", vehicleFilter],
    `/fleet/preventive-plans${vehicleFilter ? `?vehicleId=${vehicleFilter}` : ""}`
  );
  const plans = asList(data?.data || data);

  const { data: vehicles } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);

  const handleSave = async () => {
    if (!form.vehicleId || !form.serviceType) { toast({ title: "المركبة ونوع الخدمة مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/fleet/preventive-plans", { method: "POST", body: JSON.stringify({
        ...form,
        vehicleId: Number(form.vehicleId),
        intervalKm: form.intervalKm ? Number(form.intervalKm) : null,
        intervalDays: form.intervalDays ? Number(form.intervalDays) : null,
        lastServiceMileage: form.lastServiceMileage ? Number(form.lastServiceMileage) : null,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : 0,
      }) });
      toast({ title: "تم إضافة خطة الصيانة الوقائية" });
      setShowForm(false);
      setForm({ vehicleId: "", serviceType: "oil_change", intervalKm: "", intervalDays: "", lastServiceDate: "", lastServiceMileage: "", nextServiceDate: "", estimatedCost: "", notes: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const overdueCount = plans.filter((p: any) => (getDueDays(p.nextServiceDate) ?? 0) < 0).length;
  const dueSoonCount = plans.filter((p: any) => { const d = getDueDays(p.nextServiceDate); return d !== null && d >= 0 && d <= 7; }).length;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">خطط الصيانة الوقائية</h1>
            <p className="text-sm text-gray-500">جدولة الصيانة الدورية لمركبات الأسطول</p>
          </div>
          <div className="flex gap-2">
            {overdueCount > 0 && <Badge className="bg-red-100 text-red-700">{overdueCount} متأخر</Badge>}
            {dueSoonCount > 0 && <Badge className="bg-yellow-100 text-yellow-700">{dueSoonCount} قريب</Badge>}
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> إضافة خطة
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">خطة صيانة وقائية جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>المركبة *</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر مركبة" /></SelectTrigger>
                <SelectContent>
                  {vehicleList.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} — {v.make} {v.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الخدمة *</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفترة (أيام)</Label>
              <Input type="number" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} placeholder="مثال: 90" />
            </div>
            <div>
              <Label>الفترة (كم)</Label>
              <Input type="number" value={form.intervalKm} onChange={(e) => setForm({ ...form, intervalKm: e.target.value })} placeholder="مثال: 5000" />
            </div>
            <div>
              <Label>آخر خدمة</Label>
              <Input type="date" value={form.lastServiceDate} onChange={(e) => setForm({ ...form, lastServiceDate: e.target.value })} />
            </div>
            <div>
              <Label>موعد الخدمة القادمة</Label>
              <Input type="date" value={form.nextServiceDate} onChange={(e) => setForm({ ...form, nextServiceDate: e.target.value })} />
            </div>
            <div>
              <Label>التكلفة التقديرية (ر.س)</Label>
              <Input type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
            </div>
            <div>
              <Label>آخر عداد خدمة (كم)</Label>
              <Input type="number" value={form.lastServiceMileage} onChange={(e) => setForm({ ...form, lastServiceMileage: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2">
              <Button onClick={handleSave}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 items-center">
        <Label className="text-sm">تصفية بالمركبة:</Label>
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="كل المركبات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل المركبات</SelectItem>
            {vehicleList.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-gray-400">لا توجد خطط صيانة وقائية</div>
        ) : plans.map((plan: any) => {
          const dueDays = getDueDays(plan.nextServiceDate);
          const isOverdue = dueDays !== null && dueDays < 0;
          const isDueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 7;
          return (
            <Card key={plan.id} className={`hover:shadow-md transition-shadow ${isOverdue ? "border-red-200" : isDueSoon ? "border-yellow-200" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold">{plan.plateNumber}</div>
                    <div className="text-sm text-gray-500">{SERVICE_TYPES[plan.serviceType] || plan.serviceType}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isOverdue && <><AlertCircle className="w-4 h-4 text-red-500" /><Badge className="bg-red-100 text-red-700">متأخر {Math.abs(dueDays!)} يوم</Badge></>}
                    {isDueSoon && <><Clock className="w-4 h-4 text-yellow-500" /><Badge className="bg-yellow-100 text-yellow-700">خلال {dueDays} يوم</Badge></>}
                    {!isOverdue && !isDueSoon && dueDays !== null && <Badge className="bg-green-100 text-green-700">{dueDays} يوم</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-3 text-xs text-gray-500 gap-2">
                  {plan.intervalKm && <div><span className="font-medium">الفترة:</span> {plan.intervalKm} كم</div>}
                  {plan.intervalDays && <div><span className="font-medium">الفترة:</span> {plan.intervalDays} يوم</div>}
                  {plan.estimatedCost > 0 && <div><span className="font-medium">التكلفة التقديرية:</span> {plan.estimatedCost} ر.س</div>}
                  {plan.lastServiceDate && <div><span className="font-medium">آخر خدمة:</span> {plan.lastServiceDate?.split("T")[0]}</div>}
                  {plan.nextServiceDate && <div><span className="font-medium">الخدمة القادمة:</span> {plan.nextServiceDate?.split("T")[0]}</div>}
                  {plan.currentMileage && <div><span className="font-medium">العداد الحالي:</span> {plan.currentMileage} كم</div>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
