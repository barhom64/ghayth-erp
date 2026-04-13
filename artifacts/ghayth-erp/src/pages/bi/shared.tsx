import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function useChartExport() {
  const { toast } = useToast();
  const exportChart = useCallback(async (element: HTMLElement | null, filename: string = "chart.png") => {
    if (!element) {
      toast({ title: "خطأ", description: "لم يتم العثور على الرسم البياني", variant: "destructive" });
      return;
    }
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
      toast({ title: "تم التصدير", description: `تم حفظ الرسم البياني كـ ${filename}` });
    } catch (err) {
      toast({ title: "فشل التصدير", description: "تعذر تصدير الرسم البياني", variant: "destructive" });
    }
  }, [toast]);
  return { exportChart };
}

export function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <Badge variant="outline" className="text-gray-500 gap-1"><Minus className="h-3 w-3" />0%</Badge>;
  if (value > 0) return <Badge className="bg-emerald-100 text-emerald-700 gap-1"><ArrowUpRight className="h-3 w-3" />+{value}%</Badge>;
  return <Badge className="bg-red-100 text-red-700 gap-1"><ArrowDownRight className="h-3 w-3" />{value}%</Badge>;
}
