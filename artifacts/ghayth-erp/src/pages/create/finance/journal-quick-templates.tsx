import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountSelect } from "@/components/shared/entity-selects";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  Layers, FileSignature, ChevronRight, CheckCircle2, AlertTriangle,
  Building2, TrendingDown, TrendingUp, Banknote, Calendar, Users,
  Briefcase, Coins, Receipt, Lock, ArrowRight,
} from "lucide-react";
import { formatCurrency, todayLocal } from "@/lib/formatters";

/**
 * JE Quick Templates
 *
 * Library of 12 common JE patterns (depreciation, prepaid amort, accruals,
 * bank charges, etc.). User picks a template, fills variable fields
 * (accounts + amount + description), sees the JE preview, and posts.
 *
 * Beats opening the full manual journal builder for routine month-end
 * entries that always have the same 2-line shape.
 *
 * Endpoint: POST /finance/journal
 */

interface TemplateLine {
  /** Account code label hint (e.g. "5300 — استهلاك" or "اختر حساب الإهلاك") */
  label: string;
  side: "debit" | "credit";
  defaultAccountCode?: string;
}
interface Template {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: "أصول" | "خصوم" | "إيرادات" | "مصاريف" | "حقوق ملكية" | "أخرى";
  defaultDescription: string;
  lines: [TemplateLine, TemplateLine];
}

const TEMPLATES: Template[] = [
  {
    id: "depreciation", name: "إهلاك شهري", icon: TrendingDown,
    description: "تسجيل قسط استهلاك شهري لأصل ثابت", category: "مصاريف",
    defaultDescription: "إهلاك شهر",
    lines: [
      { label: "حساب مصروف الإهلاك", side: "debit", defaultAccountCode: "5300" },
      { label: "مجمع الإهلاك (مقابل أصل)", side: "credit", defaultAccountCode: "1610" },
    ],
  },
  {
    id: "prepaid-amort", name: "إطفاء مصروف مدفوع مقدماً", icon: Calendar,
    description: "إطفاء قسط من مصروف مدفوع مقدماً (مثلاً تأمين/إيجار)", category: "مصاريف",
    defaultDescription: "إطفاء قسط مدفوع مقدماً",
    lines: [
      { label: "حساب المصروف", side: "debit" },
      { label: "حساب المصاريف المدفوعة مقدماً", side: "credit", defaultAccountCode: "1190" },
    ],
  },
  {
    id: "accrued-expense", name: "مصروف مستحق", icon: Receipt,
    description: "تسجيل مصروف لم تصدر له فاتورة بعد (مثلاً كهرباء/ماء)", category: "مصاريف",
    defaultDescription: "مصروف مستحق",
    lines: [
      { label: "حساب المصروف", side: "debit" },
      { label: "حساب المصاريف المستحقة", side: "credit", defaultAccountCode: "2200" },
    ],
  },
  {
    id: "salary-accrual", name: "تخصيص رواتب شهر", icon: Users,
    description: "تخصيص رواتب الشهر قبل تنفيذ الدفع", category: "خصوم",
    defaultDescription: "تخصيص رواتب شهر",
    lines: [
      { label: "مصروف رواتب", side: "debit", defaultAccountCode: "5100" },
      { label: "رواتب مستحقة الدفع", side: "credit", defaultAccountCode: "2110" },
    ],
  },
  {
    id: "gosi-accrual", name: "تخصيص اشتراك التأمينات", icon: Briefcase,
    description: "حصة المنشأة + الموظف من GOSI", category: "خصوم",
    defaultDescription: "اشتراك التأمينات الاجتماعية",
    lines: [
      { label: "مصروف اشتراكات التأمينات", side: "debit", defaultAccountCode: "5110" },
      { label: "GOSI مستحق", side: "credit", defaultAccountCode: "2120" },
    ],
  },
  {
    id: "vacation-provision", name: "مخصص إجازات", icon: Calendar,
    description: "تخصيص شهري لإجازات الموظفين المتراكمة", category: "خصوم",
    defaultDescription: "مخصص إجازات شهري",
    lines: [
      { label: "مصروف إجازات", side: "debit", defaultAccountCode: "5120" },
      { label: "مخصص إجازات", side: "credit", defaultAccountCode: "2130" },
    ],
  },
  {
    id: "bank-charges", name: "عمولات بنكية", icon: Banknote,
    description: "خصومات وعمولات على الحساب البنكي", category: "مصاريف",
    defaultDescription: "عمولات بنكية",
    lines: [
      { label: "مصروف عمولات بنكية", side: "debit", defaultAccountCode: "5400" },
      { label: "حساب البنك", side: "credit", defaultAccountCode: "1110" },
    ],
  },
  {
    id: "interest-income", name: "إيراد فوائد بنكية", icon: Coins,
    description: "فائدة محصلة من البنك على حساب وديعة", category: "إيرادات",
    defaultDescription: "إيراد فوائد بنكية",
    lines: [
      { label: "حساب البنك", side: "debit", defaultAccountCode: "1110" },
      { label: "إيراد فوائد", side: "credit", defaultAccountCode: "4200" },
    ],
  },
  {
    id: "owner-drawing", name: "سحوبات شخصية مالك", icon: TrendingUp,
    description: "سحب نقدي للمالك من الشركة", category: "حقوق ملكية",
    defaultDescription: "سحوبات شخصية للمالك",
    lines: [
      { label: "سحوبات المالك", side: "debit", defaultAccountCode: "3200" },
      { label: "النقدية أو البنك", side: "credit", defaultAccountCode: "1110" },
    ],
  },
  {
    id: "initial-capital", name: "إيداع رأس مال", icon: Building2,
    description: "إيداع رأس مال جديد من المالك", category: "حقوق ملكية",
    defaultDescription: "إيداع رأس مال",
    lines: [
      { label: "البنك", side: "debit", defaultAccountCode: "1110" },
      { label: "رأس المال", side: "credit", defaultAccountCode: "3100" },
    ],
  },
  {
    id: "reclassification", name: "إعادة تصنيف بين حسابين", icon: ArrowRight,
    description: "نقل رصيد من حساب لحساب آخر (تصحيح تصنيف)", category: "أخرى",
    defaultDescription: "إعادة تصنيف",
    lines: [
      { label: "الحساب المراد التحويل إليه", side: "debit" },
      { label: "الحساب المراد التحويل منه", side: "credit" },
    ],
  },
  {
    id: "write-off", name: "شطب دين/أصل", icon: AlertTriangle,
    description: "شطب رصيد عميل غير قابل للتحصيل أو أصل تالف", category: "مصاريف",
    defaultDescription: "شطب رصيد",
    lines: [
      { label: "مصروف الشطب", side: "debit", defaultAccountCode: "5180" },
      { label: "الحساب المراد شطبه", side: "credit" },
    ],
  },
];

const CATEGORY_COLORS: Record<Template["category"], string> = {
  "أصول": "border-status-info-foreground",
  "خصوم": "border-status-warning-foreground",
  "إيرادات": "border-status-success-foreground",
  "مصاريف": "border-status-danger-foreground",
  "حقوق ملكية": "border-purple-500",
  "أخرى": "border-muted-foreground",
};

export default function JournalQuickTemplatesPage() {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<Template | null>(null);
  const [account1, setAccount1] = useState("");
  const [account2, setAccount2] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => todayLocal());
  const [confirming, setConfirming] = useState(false);

  const pickTemplate = (t: Template) => {
    setSelected(t);
    setAccount1(t.lines[0].defaultAccountCode ?? "");
    setAccount2(t.lines[1].defaultAccountCode ?? "");
    setAmount("");
    setDescription(t.defaultDescription);
    setConfirming(false);
  };

  const numAmount = Number(amount) || 0;
  const isValid = selected && account1 && account2 && numAmount > 0 && description.trim();

  const postMutation = useApiMutation<{ id: number }>(
    "/finance/journal",
    "POST",
    [["journal"]],
  );

  const handlePost = () => {
    if (!selected || !isValid) return;
    const lines = [
      {
        accountCode: selected.lines[0].side === "debit" ? account1 : account2,
        debit: numAmount,
        credit: 0,
        description,
      },
      {
        accountCode: selected.lines[1].side === "debit" ? account1 : account2,
        debit: 0,
        credit: numAmount,
        description,
      },
    ];
    postMutation.mutate(
      { description, date, lines },
      {
        onSuccess: (data) => {
          setConfirming(false);
          if (data?.id) {
            setTimeout(() => setLocation(`/finance/journal/${data.id}`), 1500);
          }
        },
      },
    );
  };

  const debitAccount = selected?.lines[0].side === "debit" ? account1 : account2;
  const creditAccount = selected?.lines[0].side === "credit" ? account1 : account2;

  const grouped = useMemo(() => {
    const groups: Record<Template["category"], Template[]> = {
      "أصول": [], "خصوم": [], "إيرادات": [], "مصاريف": [], "حقوق ملكية": [], "أخرى": [],
    };
    for (const t of TEMPLATES) groups[t.category].push(t);
    return groups;
  }, []);

  return (
    <PageShell
      title="قوالب قيود سريعة"
      subtitle="12 نموذج جاهز للقيود الشائعة — اختر، عبّئ المبلغ، ارفع"
    >
      <FinanceTabsNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left — template grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              اختر القالب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(grouped) as Template["category"][]).map(cat => {
              const list = grouped[cat];
              if (list.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-xs text-muted-foreground mb-1.5">{cat}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {list.map(t => {
                      const Icon = t.icon;
                      const active = selected?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => pickTemplate(t)}
                          className={`text-start border-r-4 ${CATEGORY_COLORS[t.category]} rounded p-2 hover:bg-muted/30 transition ${active ? "bg-status-info-surface" : ""}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">{t.name}</span>
                            {active && <CheckCircle2 className="w-3 h-3 text-status-info-foreground mr-auto" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground leading-tight">{t.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right — form + preview */}
        <div>
          {!selected ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ChevronRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
                اختر قالباً من القائمة على اليمين
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="mb-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <selected.icon className="w-4 h-4" />
                    {selected.name}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">{selected.description}</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {selected.lines[0].label}
                    </label>
                    <AccountSelect
                      value={account1}
                      onChange={setAccount1}
                      label=""
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {selected.lines[1].label}
                    </label>
                    <AccountSelect
                      value={account2}
                      onChange={setAccount2}
                      label=""
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">المبلغ</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="text-lg font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              {isValid && (
                <Card className="mb-3 border-status-info-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">معاينة القيد</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable<{ id: number; account: string; debit: number; credit: number }>
                      noToolbar
                      pageSize={0}
                      className="text-sm"
                      data={[
                        { id: 1, account: debitAccount, debit: numAmount, credit: 0 },
                        { id: 2, account: creditAccount, debit: 0, credit: numAmount },
                      ]}
                      columns={[
                        {
                          key: "account", header: "الحساب",
                          render: (r) => <span className="font-mono">{r.account}</span>,
                        },
                        {
                          key: "debit", header: "مدين", align: "end",
                          render: (r) => r.debit > 0
                            ? <span className="tabular-nums font-semibold text-status-success-foreground">{formatCurrency(r.debit)}</span>
                            : <span className="tabular-nums">—</span>,
                        },
                        {
                          key: "credit", header: "دائن", align: "end",
                          render: (r) => r.credit > 0
                            ? <span className="tabular-nums font-semibold text-status-danger-foreground">{formatCurrency(r.credit)}</span>
                            : <span className="tabular-nums">—</span>,
                        },
                      ] satisfies DataTableColumn<{ id: number; account: string; debit: number; credit: number }>[]}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Action */}
              <Card>
                <CardContent className="pt-6">
                  {!isValid ? (
                    <div className="text-sm text-muted-foreground text-center">
                      أكمل تعبئة الحسابين والمبلغ والوصف لعرض المعاينة
                    </div>
                  ) : !confirming ? (
                    <GuardedButton
                      perm="finance.journal.create"
                      onClick={() => setConfirming(true)}
                      className="w-full"
                      size="lg"
                    >
                      <FileSignature className="w-4 h-4 ml-2" />
                      حفظ القيد (مسودة)
                    </GuardedButton>
                  ) : (
                    <div className="border-2 border-status-warning-foreground rounded p-4 bg-status-warning-surface">
                      <div className="flex items-start gap-2 mb-3">
                        <Lock className="w-5 h-5 text-status-warning-foreground" />
                        <div className="text-sm">
                          سيُحفظ قيد <strong>{selected.name}</strong> بمبلغ{" "}
                          <strong>{formatCurrency(numAmount)}</strong> بتاريخ {date} <strong>كمسودة</strong> (يُرحَّل بعد الاعتماد).
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handlePost}
                          disabled={postMutation.isPending}
                          className="flex-1"
                          rateLimitAware
                        >
                          {postMutation.isPending ? "جاري الحفظ..." : "تأكيد الحفظ كمسودة"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setConfirming(false)}
                          disabled={postMutation.isPending}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  )}

                  {postMutation.isSuccess && postMutation.data?.id && (
                    <div className="mt-3 bg-status-success-surface text-status-success-foreground p-3 rounded flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-5 h-5" />
                      تم حفظ القيد #{postMutation.data.id} كمسودة (بانتظار الاعتماد والترحيل). جاري التحويل...
                    </div>
                  )}
                  {postMutation.isError && (
                    <div className="mt-3 bg-status-danger-surface text-status-danger-foreground p-3 rounded flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-5 h-5" />
                      فشل: {(postMutation.error as Error)?.message ?? "خطأ غير معروف"}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
