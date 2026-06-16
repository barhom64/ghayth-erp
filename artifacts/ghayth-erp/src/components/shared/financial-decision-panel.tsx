import { useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  AlertTriangle,
  CheckCircle,
  FileWarning,
  Gavel,
  MessageSquare,
  Paperclip,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { ApprovalActions } from "@workspace/workflow-kit";
import {
  FinancialAttachmentViewer,
  type FinancialAttachment,
} from "@/components/shared/financial-attachment-viewer";
import { FinancialJournalPreviewPanel } from "@/components/shared/impact-preview";

/**
 * FinancialDecisionPanel (FIN-P9-APPROVAL-WORKSPACE #2239).
 *
 * The UNIFIED approval workspace for a financial document. It is a PURE
 * COMPOSITION of the substrate built in P7/P8: the decision summary (derived
 * verdict + blockers), a READ-ONLY record + items view, the
 * FinancialAttachmentViewer (mode="review"), the FinancialJournalPreviewPanel
 * (mode="review"), the governance/causedBy notes, and finally the action row
 * (ApprovalActions). Everything above the action row is read-only — the
 * approver decides on the WHOLE record; there are NO free editors here. The
 * reject/return reasons stay inside ApprovalActions' own zod modals.
 */

export interface GovernanceEffect {
  type: string;
  label: string;
  note?: string;
}

export interface FinancialDecisionPanelProps {
  documentType: "expense" | "voucher";
  documentId: number | string;
  record: any;
  lines: any[];
  attachments: FinancialAttachment[];
  journalPreview?: any;
  governanceEffects?: GovernanceEffect[];
  approveEndpoint: string;
  rejectEndpoint: string;
  returnEndpoint: string;
  requestAttachmentEndpoint?: string;
  commentEndpoint?: string;
  attachmentRequired?: boolean;
  invalidateKeys?: any[];
  onDone?: () => void;
}

const OPERATION_LABELS: Record<string, string> = {
  expense: "مصروف عام",
  salary: "راتب",
  advance: "سلفة",
  fuel: "وقود",
  maintenance: "صيانة",
  insurance: "تأمين",
  rent: "إيجار",
  vendor_invoice: "فاتورة مورد",
  purchase: "مشتريات",
  legal_fee: "أتعاب قانونية",
  custody: "عهدة",
  custody_settlement: "تسوية عهدة",
};

const DIMENSION_KEYS: { key: string; label: string }[] = [
  { key: "vehicleId", label: "مركبة" },
  { key: "propertyId", label: "عقار" },
  { key: "projectId", label: "مشروع" },
  { key: "vendorId", label: "مورد" },
  { key: "employeeId", label: "موظف" },
  { key: "costCenter", label: "مركز تكلفة" },
  { key: "costCenterId", label: "مركز تكلفة" },
];

function num(v: unknown): number {
  return Number(v || 0);
}

export function FinancialDecisionPanel({
  documentType,
  documentId,
  record,
  lines,
  attachments,
  journalPreview,
  governanceEffects,
  approveEndpoint,
  rejectEndpoint,
  returnEndpoint,
  requestAttachmentEndpoint,
  commentEndpoint,
  attachmentRequired = false,
  invalidateKeys,
  onDone,
}: FinancialDecisionPanelProps) {
  const blockers: { message: string }[] = Array.isArray(journalPreview?.blockers)
    ? journalPreview.blockers
    : [];
  const attachmentMissing = attachmentRequired && attachments.length === 0;
  const approveBlocked = blockers.length > 0 || attachmentMissing;

  // The derived verdict reasons shown in the summary card.
  const blockReasons: string[] = [
    ...blockers.map((b) => b.message),
    ...(attachmentMissing ? ["مرفق مطلوب مفقود"] : []),
  ];

  const operationType: string | undefined = record?.operationType;
  const creator: string | undefined = record?.createdByName;
  const overrideReason: string | undefined = record?.lineAllocation?.manualOverrideReason;

  const totalDebit = lines.reduce((s, l) => s + num(l?.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l?.credit), 0);

  const approveDisabledReason = approveBlocked
    ? `لا يمكن الاعتماد: ${blockReasons.join(" • ")}`
    : undefined;

  return (
    <div className="space-y-4" data-decision-panel data-document-type={documentType}>
      {/* (a) Decision summary — derived verdict + blockers */}
      <Card className={cn(approveBlocked && "border-status-error-surface")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-muted-foreground" />
            ملخّص القرار
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            {operationType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع العملية</p>
                <Badge variant="outline">{OPERATION_LABELS[operationType] || operationType}</Badge>
              </div>
            )}
            {creator && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">مقدّم الطلب</p>
                <span className="text-status-neutral-foreground">{creator}</span>
              </div>
            )}
            {overrideReason && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تجاوز يدوي</p>
                <Badge variant="outline" className="bg-status-warning-surface text-status-warning-foreground border-yellow-300">
                  <ShieldAlert className="h-3 w-3 me-1" />
                  {overrideReason}
                </Badge>
              </div>
            )}
          </div>

          {approveBlocked ? (
            <div className="rounded-lg border border-status-error-surface bg-status-error-surface p-2.5 space-y-1" data-state="blocked">
              <div className="flex items-center gap-2 text-xs font-medium text-status-error-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                لا يمكن الاعتماد قبل معالجة ما يلي:
              </div>
              {blockReasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-status-error-foreground">
                  <FileWarning className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-status-success-foreground" data-state="clear">
              <CheckCircle className="h-3.5 w-3.5" />
              لا توجد موانع للاعتماد
            </div>
          )}
        </CardContent>
      </Card>

      {/* (b) READ-ONLY record + items table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            بيانات السجل (للعرض فقط)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {(record?.supplierName || record?.payee) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المورد / الجهة</p>
                <span className="text-status-neutral-foreground">{record.supplierName || record.payee}</span>
              </div>
            )}
            {(record?.reference || record?.invoiceNumber) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المرجع / رقم الفاتورة</p>
                <span className="text-status-neutral-foreground font-mono text-xs">
                  {record.reference || record.invoiceNumber}
                </span>
              </div>
            )}
            {record?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التاريخ</p>
                <span className="text-status-neutral-foreground">{formatDateAr(record.createdAt)}</span>
              </div>
            )}
            {(record?.branchName || record?.branchId) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الفرع</p>
                <span className="text-status-neutral-foreground">{record.branchName || `#${record.branchId}`}</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-items-table>
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-start p-1.5">الحساب</th>
                  <th className="text-start p-1.5">الأبعاد</th>
                  <th className="text-end p-1.5">مدين</th>
                  <th className="text-end p-1.5">دائن</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const dims = DIMENSION_KEYS.filter((d) => l?.[d.key] != null && l[d.key] !== "");
                  return (
                    <tr key={l?.id ?? idx} className="border-b last:border-0">
                      <td className="p-1.5 font-mono">
                        {l?.accountCode || l?.accountName || "—"}
                        {l?.accountName && l?.accountCode ? (
                          <span className="ms-1 font-sans text-muted-foreground">{l.accountName}</span>
                        ) : null}
                      </td>
                      <td className="p-1.5">
                        {dims.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          dims.map((d) => (
                            <span key={d.key} className="inline-block rounded bg-surface px-1 me-1 border">
                              {d.label}: {String(l[d.key])}
                            </span>
                          ))
                        )}
                      </td>
                      <td className="p-1.5 text-end">{num(l?.debit) ? formatCurrency(num(l.debit)) : ""}</td>
                      <td className="p-1.5 text-end">{num(l?.credit) ? formatCurrency(num(l.credit)) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t">
                  <td className="p-1.5" colSpan={2}>الإجمالي</td>
                  <td className="p-1.5 text-end">{formatCurrency(totalDebit)}</td>
                  <td className="p-1.5 text-end">{formatCurrency(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {(record?.vatAmount != null || record?.taxAmount != null) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الضريبة</p>
                <span className="text-status-neutral-foreground">
                  {formatCurrency(num(record?.vatAmount ?? record?.taxAmount))}
                </span>
              </div>
            )}
            {(record?.sourceAccountCode || record?.sourceAccountName) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">حساب المصدر</p>
                <span className="text-status-neutral-foreground font-mono text-xs">
                  {record.sourceAccountCode || record.sourceAccountName}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* (c) Attachment viewer — review mode, read-only */}
      <FinancialAttachmentViewer
        mode="review"
        canReplace={false}
        canDownload
        attachments={attachments}
        documentType={record?.attachmentType}
        documentId={documentId}
      />

      {/* (d) Journal preview — review mode */}
      {journalPreview && <FinancialJournalPreviewPanel preview={journalPreview} mode="review" />}

      {/* (e) Governance / causedBy notes — read-only */}
      {governanceEffects && governanceEffects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              الأثر الحوكمي للاعتماد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {governanceEffects.map((g, i) => (
              <div key={i} className="rounded-lg border bg-surface-subtle p-2.5 space-y-1">
                <p className="font-medium text-status-neutral-foreground">{g.label}</p>
                <p className="text-xs text-muted-foreground">
                  {g.note ??
                    "هذا الاعتماد سيُصدر حدثًا تشغيليًا — لا يُقرَّر نيابةً عن الأسطول/الموارد البشرية"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* (f) Action row — reuse ApprovalActions; optional request-attachment/comment */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ApprovalActions
            entityType={documentType}
            entityId={Number(documentId)}
            currentStatus={record?.status}
            approveEndpoint={approveEndpoint}
            rejectEndpoint={rejectEndpoint}
            returnEndpoint={returnEndpoint}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            returnMethod="PATCH"
            approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
            rejectBody={(notes) => ({ approved: false, notes })}
            returnBody={(notes) => ({ approved: "returned", notes })}
            pendingStatuses={["draft", "pending", "pending_approval", "returned"]}
            approveDisabled={approveBlocked}
            approveDisabledReason={approveDisabledReason}
            invalidateKeys={invalidateKeys}
            onDone={onDone}
          />
          {(requestAttachmentEndpoint || commentEndpoint) && (
            <DecisionNoteActions
              requestAttachmentEndpoint={requestAttachmentEndpoint}
              commentEndpoint={commentEndpoint}
              invalidateKeys={invalidateKeys}
              onDone={onDone}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Two optional side actions an approver can take WITHOUT deciding: ask the
 * submitter for a missing attachment, or leave a note. Each opens a simple
 * reason dialog (notes required) and POSTs to its endpoint. The
 * approve/reject/return reasons are handled separately inside ApprovalActions.
 */
function DecisionNoteActions({
  requestAttachmentEndpoint,
  commentEndpoint,
  invalidateKeys,
  onDone,
}: {
  requestAttachmentEndpoint?: string;
  commentEndpoint?: string;
  invalidateKeys?: any[];
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"request_attachment" | "comment" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({ notes: z.string().trim().min(1, "النص مطلوب") });

  const submit = async () => {
    const parsed = schema.safeParse({ notes });
    if (!parsed.success) {
      toast({ variant: "destructive", title: parsed.error.issues[0]?.message || "النص مطلوب" });
      return;
    }
    const endpoint = mode === "request_attachment" ? requestAttachmentEndpoint : commentEndpoint;
    if (!endpoint) return;
    setSubmitting(true);
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ notes: notes.trim() }) });
      toast({ title: mode === "request_attachment" ? "تم طلب المرفق" : "تمت إضافة الملاحظة" });
      setMode(null);
      setNotes("");
      if (invalidateKeys) invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      onDone?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "حدث خطأ" });
    } finally {
      setSubmitting(false);
    }
  };

  if (mode) {
    return (
      <div className="bg-surface-subtle rounded-lg p-3 border space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" />
          {mode === "request_attachment" ? "طلب مرفق مفقود" : "إضافة ملاحظة"}
        </div>
        <Label className="text-xs">النص *</Label>
        <textarea
          className="w-full border rounded-md p-2 text-sm resize-none"
          rows={2}
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={mode === "request_attachment" ? "اذكر المرفق المطلوب..." : "اكتب ملاحظتك..."}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={submit} disabled={submitting}>
            {submitting ? "جاري..." : "إرسال"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setMode(null); setNotes(""); }}>
            إلغاء
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {requestAttachmentEndpoint && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setMode("request_attachment")}>
          <Paperclip className="h-3.5 w-3.5 me-1" />
          طلب مرفق
        </Button>
      )}
      {commentEndpoint && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setMode("comment")}>
          <MessageSquare className="h-3.5 w-3.5 me-1" />
          ملاحظة
        </Button>
      )}
    </div>
  );
}
