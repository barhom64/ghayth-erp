import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ROUTE_TYPES } from "@/lib/transport-constants";

interface Props {
  bookingId: number | string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a line is added so the parent can refetch the booking. */
  onAdded: () => void;
}

// #TA-T18-UX-AUDIT-01 P1-3 — إضافة سطر إلى حجز قائم من شاشة التفاصيل بدل
// إعادة إنشاء الحجز كاملًا. كل حقول bookingLineSchema اختيارية في الخادم؛
// نشترط «من/إلى» محليًا لسطرٍ ذي معنى. يعيد استخدام ROUTE_TYPES الموحّد.
export function AddBookingLineDialog({ bookingId, open, onOpenChange, onAdded }: Props) {
  const { toast } = useToast();
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [routeType, setRouteType] = useState("");
  const [passengerCount, setPassengerCount] = useState("");
  const [capacityKg, setCapacityKg] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFromText(""); setToText(""); setRouteType(""); setPassengerCount("");
    setCapacityKg(""); setDescription(""); setNotes("");
  };

  const submit = async () => {
    if (!fromText.trim() || !toText.trim()) {
      toast({ variant: "destructive", title: "حدّد نقطتَي الانطلاق والوصول على الأقل" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fromLocationText: fromText.trim(),
        toLocationText: toText.trim(),
      };
      if (routeType) body.legRouteType = routeType;
      if (passengerCount) body.passengerCount = Number(passengerCount);
      if (capacityKg) body.requiredCapacityKg = Number(capacityKg);
      if (description.trim()) body.lineDescription = description.trim();
      if (notes.trim()) body.notes = notes.trim();
      await apiFetch(`/transport/bookings/${bookingId}/lines`, {
        method: "POST", body: JSON.stringify(body),
      });
      toast({ title: "تمت إضافة السطر" });
      reset();
      onOpenChange(false);
      onAdded();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر إضافة السطر", description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة سطر للحجز</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <Label>من *</Label>
            <Input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="نقطة الانطلاق" />
          </div>
          <div>
            <Label>إلى *</Label>
            <Input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="نقطة الوصول" />
          </div>
          <div>
            <Label>نوع المسار</Label>
            <Select value={routeType} onValueChange={setRouteType}>
              <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
              <SelectContent>
                {ROUTE_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>عدد الركاب</Label>
            <Input type="number" min={0} value={passengerCount} onChange={(e) => setPassengerCount(e.target.value)} />
          </div>
          <div>
            <Label>الحمولة المطلوبة (كجم)</Label>
            <Input type="number" min={0} value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} />
          </div>
          <div>
            <Label>وصف السطر</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>ملاحظات</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "جارٍ الحفظ…" : "إضافة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
