import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Users, CheckCircle2, Calendar } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { todayLocal } from "@/lib/formatters";

// #1812 governing comment — "الحجز غير مرتبط بمصادر النظام". The user's
// audit: when an operator creates a passenger_umrah booking, the system
// must ASK "is this from an umrah group in the system?" + pull the
// group's hotel/housing/pax data instead of forcing manual retype.
//
// This picker is the surface that operationalises that. Reads from the
// existing /transport/integration/linked-sources endpoint (which already
// returns umrah groups + mutamerCount + season dates + existingBookings
// count, so the operator can see which groups already have transport).

interface UmrahGroupOption {
  id: number;
  nuskGroupNumber: string;
  name: string | null;
  mutamerCount: number;
  programDuration: number | null;
  seasonStartDate: string | null;
  seasonEndDate: string | null;
  existingBookings: number;
}

interface Props {
  /** When the picker selects a group, the caller receives the full
   *  record so it can fill umrahGroupId, passengerCount, etc. */
  onSelect: (group: UmrahGroupOption) => void;
  /** Whether the trigger button is rendered, or whether the dialog is
   *  controlled by `open`/`onOpenChange` from the outside. */
  trigger?: React.ReactNode;
}

export function UmrahGroupPicker({ onSelect, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const today = todayLocal();
  // Default window: today → today + 60 days (the operator usually
  // looks at upcoming groups, not historical). Local-calendar arithmetic
  // via Intl so the dates match the operator's wall clock, not UTC.
  const toDate = (() => {
    const d = new Date(Date.now() + 60 * 86_400_000);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(d);
  })();

  const { data, isLoading } = useApiQuery<{
    data: { umrahGroups: UmrahGroupOption[]; counts: { umrahGroupsNeedTransport: number } };
  }>(
    ["umrah-group-picker", today, toDate],
    open ? `/transport/integration/linked-sources?fromDate=${today}&toDate=${toDate}` : null,
  );

  const groups = data?.data?.umrahGroups ?? [];
  const filtered = search
    ? groups.filter((g) =>
        g.nuskGroupNumber.toLowerCase().includes(search.toLowerCase()) ||
        (g.name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : groups;

  const pick = (g: UmrahGroupOption) => {
    onSelect(g);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)} className="inline-flex">
          {trigger}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Search className="h-4 w-4 me-1" />اختر من مجموعات العمرة
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-status-info-foreground" />
              اختر مجموعة عمرة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              ربط الحجز بمجموعة عمرة من النظام يجلب تلقائياً عدد المعتمرين وفترة الموسم،
              ويثبّت مصدر الحجز في سجل التدقيق. الفندق يُدخَل يدوياً (قد تتوزّع
              المجموعة على أكثر من فندق).
            </p>
            <Input
              placeholder="ابحث برقم نسك أو اسم المجموعة…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />

            <div className="max-h-[50vh] overflow-y-auto space-y-2 mt-2">
              {isLoading ? (
                <LoadingSpinner />
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {search
                    ? "لا توجد مجموعات تطابق البحث."
                    : "لا توجد مجموعات عمرة في الفترة القادمة. أنشئ مجموعة من شاشة العمرة أو وسّع نطاق التاريخ."}
                </div>
              ) : (
                filtered.map((g) => (
                  <Card
                    key={g.id}
                    className={`cursor-pointer border-2 hover:bg-surface-subtle transition ${
                      g.existingBookings > 0
                        ? "border-status-success-foreground/30 bg-status-success-surface/30"
                        : "border-status-warning-foreground/30 bg-status-warning-surface/20"
                    }`}
                    onClick={() => pick(g)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{g.nuskGroupNumber}</span>
                          {g.name && <span className="text-sm text-muted-foreground">— {g.name}</span>}
                        </div>
                        <Badge variant="outline">
                          <Users className="h-3 w-3 me-1" />{g.mutamerCount} معتمر
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {(g.seasonStartDate || g.seasonEndDate) && (
                          <div className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {g.seasonStartDate ?? "—"} → {g.seasonEndDate ?? "—"}
                            {g.programDuration != null && (
                              <span className="ms-1">({g.programDuration} يوم)</span>
                            )}
                          </div>
                        )}
                        {g.existingBookings > 0 ? (
                          <div className="text-status-success-foreground inline-flex items-center gap-1 mt-1">
                            <CheckCircle2 className="h-3 w-3" />
                            يوجد {g.existingBookings} حجز نقل مرتبط بالفعل
                          </div>
                        ) : (
                          <div className="text-status-warning-foreground mt-1">
                            لا توجد حجوزات نقل بعد لهذه المجموعة
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
