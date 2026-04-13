import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

interface AccountInfoCardProps {
  email: string | undefined;
  name: string | undefined;
  selectedRoleLabel: string;
}

export function AccountInfoCard({ email, name, selectedRoleLabel }: AccountInfoCardProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-500" />
          معلومات حسابي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <span className="text-sm text-gray-600">البريد الإلكتروني</span>
          <span className="text-sm font-mono font-medium text-gray-800">{email || "—"}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <span className="text-sm text-gray-600">الدور الحالي</span>
          <span className="text-sm font-medium text-indigo-700">{selectedRoleLabel}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <span className="text-sm text-gray-600">اسم الموظف</span>
          <span className="text-sm font-medium">{name || "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
