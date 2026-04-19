import { useState } from "react";
import { useLocation } from "wouter";
import { apiFetch, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Save } from "lucide-react";
import { Link } from "wouter";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

export default function PilgrimCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { data: seasons, isLoading: l1, isError: e1 } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const { data: agents, isLoading: l2, isError: e2 } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const { data: packages, isLoading: l3, isError: e3 } = useApiQuery<any>(["umrah-packages"], "/umrah/packages");

  const isLoading = l1 || l2 || l3;
  const isError = e1 || e2 || e3;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const update = (key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val }));

  const save = async () => {
    if (!form.fullName || !form.passportNumber) {
      toast({ variant: "destructive", title: "الاسم ورقم الجواز مطلوبان" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/umrah/pilgrims", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إضافة المعتمر بنجاح" });
      navigate("/umrah/pilgrims");
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.error || "خطأ في الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/umrah/pilgrims"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
        <h1 className="text-3xl font-bold">إضافة معتمر جديد</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>بيانات المعتمر</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>الاسم الكامل *</Label><Input value={form.fullName || ""} onChange={e => update("fullName", e.target.value)} /></div>
          <div><Label>رقم الجواز *</Label><Input value={form.passportNumber || ""} onChange={e => update("passportNumber", e.target.value)} /></div>
          <div><Label>رقم التأشيرة</Label><Input value={form.visaNumber || ""} onChange={e => update("visaNumber", e.target.value)} /></div>
          <div><Label>الجنسية</Label><Input value={form.nationality || ""} onChange={e => update("nationality", e.target.value)} /></div>
          <div><Label>الجنس</Label>
            <Select value={form.gender || ""} onValueChange={v => update("gender", v)}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">ذكر</SelectItem>
                <SelectItem value="female">أنثى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ الميلاد</Label><DatePicker value={form.dateOfBirth || ""} onChange={v => update("dateOfBirth", v)} /></div>
          <div><Label>الهاتف</Label><Input value={form.phone || ""} onChange={e => update("phone", e.target.value)} /></div>
          <div><Label>الموسم</Label>
            <Select value={form.seasonId ? String(form.seasonId) : ""} onValueChange={v => update("seasonId", Number(v))}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>{(seasons?.data || []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الوكيل</Label>
            <Select value={form.agentId ? String(form.agentId) : ""} onValueChange={v => update("agentId", Number(v))}>
              <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
              <SelectContent>{(agents?.data || []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الباقة</Label>
            <Select value={form.packageId ? String(form.packageId) : ""} onValueChange={v => update("packageId", Number(v))}>
              <SelectTrigger><SelectValue placeholder="اختر الباقة" /></SelectTrigger>
              <SelectContent>{(packages?.data || []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ الوصول</Label><DatePicker value={form.arrivalDate || ""} onChange={v => update("arrivalDate", v)} /></div>
          <div><Label>تاريخ المغادرة</Label><DatePicker value={form.departureDate || ""} onChange={v => update("departureDate", v)} /></div>
          <div><Label>الفندق</Label><Input value={form.hotelName || ""} onChange={e => update("hotelName", e.target.value)} /></div>
          <div><Label>رقم الغرفة</Label><Input value={form.roomNumber || ""} onChange={e => update("roomNumber", e.target.value)} /></div>
          <div className="md:col-span-3"><Label>ملاحظات</Label><Textarea rows={3} value={form.notes || ""} onChange={e => update("notes", e.target.value)} /></div>
          <div className="md:col-span-3">
            <FileDropZone files={attachments} onFilesChange={setAttachments} />
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <Link href="/umrah/pilgrims"><Button variant="outline">إلغاء</Button></Link>
            <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
