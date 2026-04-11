import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteConfirmImpactProps {
  entityType: string;
  entityId: number;
  entityName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

interface ImpactItem {
  type: string;
  icon: string;
  label: string;
  detail: string;
}

export function DeleteConfirmImpact({
  entityType,
  entityId,
  entityName,
  onConfirm,
  onCancel,
  isPending,
}: DeleteConfirmImpactProps) {
  const [impacts, setImpacts] = useState<ImpactItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ impacts: ImpactItem[] }>("/impact-preview", {
      method: "POST",
      body: JSON.stringify({
        entityType,
        entityId,
        action: "delete",
      }),
    })
      .then((resp) => {
        if (resp.impacts && Array.isArray(resp.impacts)) {
          setImpacts(resp.impacts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const hasImpact = impacts.length > 0;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-red-900">
            تأكيد حذف "{entityName}"
          </h4>
          {loading ? (
            <div className="flex items-center gap-2 mt-2 text-sm text-red-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري فحص البيانات المرتبطة...
            </div>
          ) : hasImpact ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-red-700 font-medium">سيتأثر بالحذف:</p>
              {impacts.map((impact, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                  <span className="flex-shrink-0">{impact.icon}</span>
                  <span className="font-medium">{impact.label}:</span>
                  <span>{impact.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-red-700 mt-1">
              هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={isPending || loading}
            >
              {isPending ? (
                <><Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />جاري الحذف...</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5 me-1" />تأكيد الحذف</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
              إلغاء
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
