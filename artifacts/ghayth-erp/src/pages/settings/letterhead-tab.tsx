import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, Save, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { LetterheadHeader } from "@/components/print-layout";
import type { BranchLetterhead } from "@/components/print-layout";

export function LetterheadSettings() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = data?.data || [];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", nameEn: "", city: "", phone: "",
    logoUrl: "", address: "", taxNumber: "", crNumber: "",
    email: "", website: "", footerText: "",
  });
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      selectBranch(branches[0]);
    }
  }, [branches]);

  const selectBranch = (branch: any) => {
    setSelectedBranchId(branch.id);
    setForm({
      name: branch.name || "",
      nameEn: branch.nameEn || "",
      city: branch.city || "",
      phone: branch.phone || "",
      logoUrl: branch.logoUrl || "",
      address: branch.address || "",
      taxNumber: branch.taxNumber || "",
      crNumber: branch.crNumber || "",
      email: branch.email || "",
      website: branch.website || "",
      footerText: branch.footerText || "",
    });
  };

  const handleSave = async () => {
    if (!selectedBranchId) return;
    setSaving(true);
    try {
      await apiFetch(`/settings/branches/${selectedBranchId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toast({ title: "تم حفظ بيانات الكليشة" });
      qc.invalidateQueries({ queryKey: ["settings-branches"] });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ في الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  const previewBranch: BranchLetterhead = {
    name: form.name,
    nameEn: form.nameEn,
    logoUrl: form.logoUrl,
    address: form.address,
    phone: form.phone,
    email: form.email,
    website: form.website,
    taxNumber: form.taxNumber,
    crNumber: form.crNumber,
    footerText: form.footerText,
    city: form.city,
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Printer className="h-5 w-5" />
        إعدادات الكليشة والمطبوعات
      </h3>

      {branches.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">
          لا توجد فروع. أضف فرعاً أولاً من تبويب الفروع.
        </CardContent></Card>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {branches.map((b: any) => (
              <Button
                key={b.id}
                variant={selectedBranchId === b.id ? "default" : "outline"}
                size="sm"
                onClick={() => selectBranch(b)}
              >
                {b.name}
              </Button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>بيانات الكليشة - {form.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>اسم الشركة/الفرع (عربي)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>الاسم (إنجليزي)</Label><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
                  <div><Label>المدينة</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>البريد الإلكتروني</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>الموقع الإلكتروني</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                  <div><Label>الرقم الضريبي</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} /></div>
                  <div><Label>رقم السجل التجاري</Label><Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>رابط الشعار</Label><Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" /></div>
                  <div className="md:col-span-2"><Label>العنوان التفصيلي</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>نص التذييل</Label><Textarea className="h-16" value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} placeholder="يظهر في أسفل كل مطبوعة..." /></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الكليشة"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                    <Eye className="h-4 w-4 me-1" />{showPreview ? "إخفاء المعاينة" : "معاينة الكليشة"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {showPreview && (
              <Card>
                <CardHeader><CardTitle>معاينة الكليشة</CardTitle></CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-6 bg-white shadow-inner" style={{ minHeight: "300px" }}>
                    <LetterheadHeader branch={previewBranch} />
                    <div className="text-center my-8">
                      <p className="text-gray-400 text-sm">محتوى المستند يظهر هنا</p>
                      <div className="border-t border-dashed border-gray-300 mt-4 pt-4">
                        <p className="text-xs text-gray-400">هذه معاينة توضيحية لشكل الكليشة</p>
                      </div>
                    </div>
                    {form.footerText && (
                      <div className="border-t border-gray-300 pt-3 mt-8 text-xs text-gray-500">
                        {form.footerText}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
