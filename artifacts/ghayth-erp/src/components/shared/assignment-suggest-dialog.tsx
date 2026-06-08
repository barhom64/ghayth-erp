import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wand2, AlertCircle, CheckCircle2, MapPin, User, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// #1812 — Suggest-Assignment dialog. Wraps POST
// /transport/bookings/:id/suggest-assignment and displays the ranked
// list of candidates returned by AssignmentSuggestionEngine, with a
// human-readable breakdown of each score component and the "blockers"
// (HARD failures the operator must explicitly override).
//
// Picking a candidate fires a callback to the caller; the caller is
// responsible for the actual dispatch-order create (so the same
// component can be used from the booking detail, the dispatch board,
// and the ops dashboard).

export interface SuggestionCandidate {
  vehicleId: number;
  vehiclePlate: string | null;
  vehicleType: string | null;
  driverId: number;
  driverName: string | null;
  score: number;
  scores: {
    capacity: number;
    availability: number;
    conflict: number;
    driverRest: number;
    license: number;
    distance: number;
    agreement: number;
  };
  reasons: string[];
  blockers: string[];
  estimatedDistanceKm: number | null;
}

interface Props {
  bookingId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  onSelect?: (candidate: SuggestionCandidate) => void;
}

const SCORE_BAND = (s: number) =>
  s >= 80 ? "bg-status-success-surface text-status-success-foreground" :
  s >= 60 ? "bg-status-warning-surface text-status-warning-foreground" :
  s >= 1  ? "bg-rose-100 text-rose-700" :
            "bg-surface-subtle text-muted-foreground";

const SCORE_LABEL: Record<keyof SuggestionCandidate["scores"], string> = {
  capacity:     "السعة",
  availability: "الجاهزية",
  conflict:     "التعارض",
  driverRest:   "راحة السائق",
  license:      "الرخصة",
  distance:     "القرب",
  agreement:    "اتفاق العميل",
};

export function AssignmentSuggestDialog({
  bookingId, open, onOpenChange, scheduledStartAt, scheduledEndAt, onSelect,
}: Props) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<SuggestionCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const body: Record<string, unknown> = {};
      if (scheduledStartAt) body.scheduledStartAt = scheduledStartAt;
      if (scheduledEndAt) body.scheduledEndAt = scheduledEndAt;
      const res = await apiFetch<{ data: SuggestionCandidate[] }>(
        `/transport/bookings/${bookingId}/suggest-assignment`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setCandidates(res?.data ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when the dialog opens for the first time.
  if (open && candidates == null && !loading && !error) {
    run();
  }
  if (!open && candidates != null) {
    // Reset between opens so re-clicking re-fetches.
    setCandidates(null);
    setError(null);
  }

  const pick = (c: SuggestionCandidate) => {
    if (c.blockers.length > 0) {
      toast({
        variant: "destructive",
        title: "هذا الاقتراح يحتوي على عوائق صارمة",
        description: "وثّق سبب الاستثناء في شاشة الإسناد إذا أردت المتابعة.",
      });
    }
    onSelect?.(c);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-status-info-foreground" />
            اقتراحات النظام للمركبة والسائق
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              يحسب النظام التطابق…
            </div>
          )}
          {error && (
            <Card className="border-rose-300 bg-rose-50">
              <CardContent className="p-3 text-sm text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />{error}
              </CardContent>
            </Card>
          )}
          {candidates && candidates.length === 0 && !loading && !error && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              لا توجد مركبات أو سائقون في الشركة، أو الحجز ليس له نافذة زمنية محددة.
              تأكد من إعدادات الأسطول والسائقين أولاً.
            </div>
          )}
          {/* #1812 — when ALL candidates have HARD blockers (score 0),
              the previous UX showed them ranked but didn't tell the
              operator WHY everything failed. This aggregator surfaces
              the dominant blocker reasons so they can fix the root
              cause (e.g. "all drivers need rest" vs "no vehicle has
              capacity"). */}
          {candidates && candidates.length > 0 && candidates.every((c) => c.blockers.length > 0) && (
            <Card className="border-rose-300 bg-rose-50">
              <CardContent className="p-3 text-sm space-y-2">
                <div className="font-medium text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  جميع المرشحين البالغ عددهم {candidates.length} لديهم عوائق صارمة. الأسباب الأكثر تكراراً:
                </div>
                {(() => {
                  const counts = new Map<string, number>();
                  for (const c of candidates) for (const b of c.blockers) {
                    // Bucket by the leading phrase to dedupe minor
                    // variations (e.g. specific values inside the message).
                    const key = b.replace(/\d+(\.\d+)?/g, "N").slice(0, 80);
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                  }
                  const top = Array.from(counts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                  return (
                    <ul className="text-xs text-rose-700 space-y-1">
                      {top.map(([msg, count], i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="font-mono bg-rose-100 px-1.5 rounded">{count}×</span>
                          {msg}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                <div className="text-xs text-muted-foreground">
                  راجع إعدادات راحة السائقين، التعارضات الزمنية، أو اتفاق العميل (سياسة الاستبدال).
                </div>
              </CardContent>
            </Card>
          )}
          {candidates && candidates.map((c, idx) => (
            <Card
              key={`${c.vehicleId}-${c.driverId}`}
              className={`border-2 ${
                idx === 0 && c.score >= 80 ? "border-status-success-foreground/40 bg-status-success-surface/30" :
                c.blockers.length > 0      ? "border-rose-200 bg-rose-50" : ""
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{c.vehiclePlate ?? `#${c.vehicleId}`}</span>
                      {c.vehicleType && <span className="text-xs text-muted-foreground">({c.vehicleType})</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm mt-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{c.driverName ?? `سائق #${c.driverId}`}</span>
                      {c.estimatedDistanceKm != null && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.estimatedDistanceKm} كم
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`text-base px-3 py-1 ${SCORE_BAND(c.score)}`}>
                      {c.score}
                    </Badge>
                    {idx === 0 && c.score >= 80 && (
                      <Badge variant="outline" className="bg-status-success-surface text-status-success-foreground text-[10px]">
                        أفضل اقتراح
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Score breakdown */}
                <div className="grid grid-cols-3 md:grid-cols-7 gap-1 mt-2 text-[10px]">
                  {(Object.keys(c.scores) as Array<keyof typeof c.scores>).map((k) => (
                    <div
                      key={k}
                      className={`text-center p-1 rounded ${SCORE_BAND(c.scores[k])}`}
                      title={`${SCORE_LABEL[k]}: ${c.scores[k]}`}
                    >
                      <div className="font-mono">{c.scores[k]}</div>
                      <div className="text-[9px]">{SCORE_LABEL[k]}</div>
                    </div>
                  ))}
                </div>

                {c.reasons.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {c.reasons.map((r, i) => (
                      <div key={i} className="text-xs text-status-info-foreground inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />{r}
                      </div>
                    ))}
                  </div>
                )}
                {c.blockers.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {c.blockers.map((b, i) => (
                      <div key={i} className="text-xs text-rose-700 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />{b}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant={c.blockers.length > 0 ? "outline" : "default"} onClick={() => pick(c)} rateLimitAware>
                    {c.blockers.length > 0 ? "اعتمد رغم العوائق" : "اعتمد هذا الاقتراح"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button onClick={run} disabled={loading} rateLimitAware>
            {loading ? "جارٍ الحساب…" : "إعادة الحساب"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
