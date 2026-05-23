import { useState, useRef } from "react";
import { getCurrencySymbol, formatDateAr, formatCurrency } from "@/lib/formatters";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, asList, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { STATUSES } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageStatusBadge } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@workspace/report-kit";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import type { LucideIcon } from "lucide-react";
import { Target, DollarSign, Calendar, User, TrendingUp, Phone, Mail, MessageSquare, Pencil, Trash2, X, Check } from "lucide-react";
import { DetailPageLayout } from "@workspace/entity-kit";
import { EntityComments } from "@workspace/entity-kit";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

export default function OpportunityDetail() {
  const [, params] = useRoute("/crm/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("crm_opportunity", id ?? 0);

  const { data: opportunity, isLoading, isError, error } = useApiQuery<any>(["opportunity-detail", id || ""], `/crm/opportunities/${id}`, !!id);
  const { data: activitiesResp } = useApiQuery<any>(["opportunity-activities", id || ""], `/crm/opportunities/${id}/activities`, !!id && !!opportunity);
  const activities = asList(activitiesResp);

  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const ACT_INITIAL = { type: "call", description: "", scheduledAt: "" };
  const [addingActivity, setAddingActivity] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [actForm, setActForm] = useState(ACT_INITIAL);

  const actTypeMap: Record<string, { label: string; icon: LucideIcon }> = {
    meeting: { label: "اجتماع", icon: User },
    call: { label: "مكالمة", icon: Phone },
    email: { label: "بريد", icon: Mail },
  };

  const startEdit = () => {
    setEditForm({
      title: opportunity.title || "",
      value: String(opportunity.value || 0),
      probability: String(opportunity.probability || 50),
      stage: opportunity.stage || "lead",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await apiFetch(`/crm/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: editForm.stage,
          value: Number(editForm.value),
          probability: Number(editForm.probability),
        }),
      });
      toast({ title: "تم تحديث الفرصة" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["opportunity-detail", id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/crm/opportunities/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف الفرصة" });
      navigate("/crm");
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const submitActivity = async () => {
    if (!actForm.description.trim() || !actForm.scheduledAt) {
      toast({ variant: "destructive", title: "الوصف وتاريخ النشاط مطلوبان" });
      return;
    }
    setSavingActivity(true);
    try {
      await apiFetch(`/crm/opportunities/${id}/activities`, {
        method: "POST",
        body: JSON.stringify({
          type: actForm.type,
          description: actForm.description.trim(),
          scheduledAt: actForm.scheduledAt,
        }),
      });
      toast({ title: "تمت إضافة النشاط" });
      setActForm(ACT_INITIAL);
      setAddingActivity(false);
      qc.invalidateQueries({ queryKey: ["opportunity-activities", id || ""] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
    setSavingActivity(false);
  };

  const value = Number(opportunity?.value) || 0;
  const probability = Number(opportunity?.probability) || 0;

  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      <PageStatusBadge status={opportunity?.stage} />
      <PrintActions
        onPreview={() => setShowPreview(true)}
        onPrint={() => directPrint(printContainerRef.current, `عرض سعر - ${opportunity?.title}`)}
      />
      <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 me-1" />تعديل</Button>
      {deleting ? (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
          <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-status-error-foreground" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
      )}
    </div>
  );

  const overview = (
    <>
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">تعديل الفرصة</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">المرحلة</label>
                <Select value={editForm.stage} onValueChange={(v) => setEditForm(f => ({...f, stage: v}))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[["lead", "عميل محتمل"], ["qualified", "مؤهل"], ["proposal", "عرض سعر"], ["negotiation", "تفاوض"], ["closed_won", "مغلق (ربح)"], ["closed_lost", "مغلق (خسارة)"]].map(([k, v]) => <SelectItem key={k} value={k}>{v as string}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{`القيمة ( ${getCurrencySymbol()})`}</label>
                <Input type="number" value={editForm.value} onChange={e => setEditForm(f => ({...f, value: e.target.value}))} className="mt-1" dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-medium">الاحتمالية (%)</label>
                <Input type="number" min="0" max="100" value={editForm.probability} onChange={e => setEditForm(f => ({...f, probability: e.target.value}))} className="mt-1" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button onClick={saveEdit}><Check className="h-4 w-4 me-1" />حفظ</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 me-1" />إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-success-surface"><DollarSign className="w-5 h-5 text-status-success-foreground" /></div>
          <div><p className="text-xl font-bold">{value > 0 ? `${(value / 1000).toFixed(0)}K` : "0"}</p><p className="text-xs text-muted-foreground">{`قيمة الفرصة ( ${getCurrencySymbol()})`}</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-info-surface"><TrendingUp className="w-5 h-5 text-status-info-foreground" /></div>
          <div><p className="text-xl font-bold">{probability}%</p><p className="text-xs text-muted-foreground">احتمالية الإغلاق</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50"><Calendar className="w-5 h-5 text-purple-600" /></div>
          <div><p className="text-lg font-bold">{opportunity?.expectedCloseDate ? formatDateAr(opportunity.expectedCloseDate) : "-"}</p><p className="text-xs text-muted-foreground">الإغلاق المتوقع</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-50"><MessageSquare className="w-5 h-5 text-orange-600" /></div>
          <div><p className="text-xl font-bold">{activities.length}</p><p className="text-xs text-muted-foreground">الأنشطة</p></div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5" /> الأنشطة</CardTitle>
              {!addingActivity && (
                <Button size="sm" variant="outline" onClick={() => setAddingActivity(true)}>نشاط جديد</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {addingActivity && (
                <div className="rounded-lg border p-3 space-y-3 bg-surface-subtle">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select value={actForm.type} onValueChange={(v) => setActForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">مكالمة</SelectItem>
                        <SelectItem value="meeting">اجتماع</SelectItem>
                        <SelectItem value="email">بريد</SelectItem>
                        <SelectItem value="follow_up">متابعة</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={actForm.scheduledAt}
                      onChange={(e) => setActForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    />
                  </div>
                  <Input
                    placeholder="وصف النشاط"
                    value={actForm.description}
                    onChange={(e) => setActForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setAddingActivity(false); setActForm(ACT_INITIAL); }}>إلغاء</Button>
                    <Button size="sm" disabled={savingActivity} onClick={submitActivity} rateLimitAware>
                      {savingActivity ? "جاري الحفظ..." : "حفظ النشاط"}
                    </Button>
                  </div>
                </div>
              )}
              {activities.length === 0 && !addingActivity && <p className="text-center text-muted-foreground py-4">لا توجد أنشطة</p>}
              {activities.map((a: any) => {
                const at = actTypeMap[a.type];
                const Icon = at?.icon || MessageSquare;
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-status-info-surface shrink-0">
                      <Icon className="w-4 h-4 text-status-info-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{a.description}</span>
                        <PageStatusBadge status={a.status || "pending"} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{at?.label || a.type} • {a.scheduledAt ? formatDateAr(a.scheduledAt) : a.createdAt ? formatDateAr(a.createdAt) : "-"}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">معلومات الفرصة</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="py-2 border-b"><span className="text-muted-foreground block mb-1">جهة الاتصال</span><span className="font-medium">{opportunity?.contactName || "-"}</span></div>
            <div className="py-2 border-b"><span className="text-muted-foreground block mb-1">الهاتف</span><span dir="ltr">{opportunity?.contactPhone || "-"}</span></div>
            <div className="py-2 border-b"><span className="text-muted-foreground block mb-1">البريد</span><span>{opportunity?.contactEmail || "-"}</span></div>
            <div className="py-2 border-b"><span className="text-muted-foreground block mb-1">المسؤول</span><span>{opportunity?.assigneeName || "-"}</span></div>
            <div className="py-2 border-b"><span className="text-muted-foreground block mb-1">المصدر</span><span>{opportunity?.source || "-"}</span></div>
            <div className="py-2"><span className="text-muted-foreground block mb-1">تاريخ الإنشاء</span><span>{opportunity?.createdAt ? formatDateAr(opportunity.createdAt) : "-"}</span></div>
          </CardContent>
        </Card>
        </div>
      </div>

      {id && <EntityComments entityType="opportunity" entityId={id} />}
      {id && <EntityTags entityType="opportunity" entityId={id} />}
    </>
  );

  return (
    <>
      <DetailPageLayout
        title={opportunity?.title || "الفرصة"}
        subtitle={opportunity?.clientName || opportunity?.contactName || undefined}
        backPath="/crm/opportunities"
        backLabel="العودة"
        entityType="opportunity"
        entityId={id!}
        isLoading={isLoading}
        error={isError ? error : undefined}
       
        createdAt={opportunity?.createdAt}
        updatedAt={opportunity?.updatedAt}
        extraTabs={registryExtraTabs}
        hideTabs={registryHideTabs}
        overview={overview}
        actions={actions}
      />
      {opportunity && (
        <>
          <PrintPreviewModal
            open={showPreview}
            onClose={() => setShowPreview(false)}
            branch={branch}
            documentTitle={opportunity.stage === "proposal" ? "عرض سعر" : "فرصة بيعية"}
            documentRef={`OPP-${opportunity.id}`}
            documentDate={opportunity.createdAt ? formatDateAr(opportunity.createdAt) : ""}
          >
            <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
              <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>العميل:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.clientName || opportunity.contactName || "-"}</span>
              </div>
              {opportunity.contactPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.contactPhone}</span>
              </div>}
              {opportunity.contactEmail && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>البريد:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.contactEmail}</span>
              </div>}
              <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>المرحلة:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{STATUSES[opportunity.stage] || opportunity.stage}</span>
              </div>
              {opportunity.expectedCloseDate && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>الإغلاق المتوقع:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{formatDateAr(opportunity.expectedCloseDate)}</span>
              </div>}
              {opportunity.assigneeName && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                <span className="info-label" style={{ color: "#555" }}>المسؤول:</span>
                <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.assigneeName}</span>
              </div>}
            </div>

            <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
              <tbody>
                <tr>
                  <td style={{ color: "#555", border: "none", padding: "4px 8px" }}>قيمة العرض:</td>
                  <td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{formatCurrency(value)}</td>
                </tr>
                <tr>
                  <td style={{ color: "#555", border: "none", padding: "4px 8px" }}>الاحتمالية:</td>
                  <td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{probability}%</td>
                </tr>
              </tbody>
            </table>

            {opportunity.notes && <p style={{ marginTop: "16px", color: "#555" }}>ملاحظات: {opportunity.notes}</p>}

            <div className="signature-area" style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
              <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
                <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>توقيع المسؤول</div>
              </div>
              <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
                <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>توقيع العميل</div>
              </div>
            </div>
          </PrintPreviewModal>

          <div ref={printContainerRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
            <PrintDocument branch={branch} documentTitle={opportunity.stage === "proposal" ? "عرض سعر" : "فرصة بيعية"} documentRef={`OPP-${opportunity.id}`} documentDate={opportunity.createdAt ? formatDateAr(opportunity.createdAt) : ""}>
              <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>العميل:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.clientName || opportunity.contactName || "-"}</span>
                </div>
                {opportunity.contactPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.contactPhone}</span>
                </div>}
                {opportunity.contactEmail && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>البريد:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{opportunity.contactEmail}</span>
                </div>}
                <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>المرحلة:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{STATUSES[opportunity.stage] || opportunity.stage}</span>
                </div>
              </div>
              <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
                <tbody>
                  <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>قيمة العرض:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{formatCurrency(value)}</td></tr>
                  <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>الاحتمالية:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{probability}%</td></tr>
                </tbody>
              </table>
              {opportunity.notes && <p style={{ marginTop: "16px", color: "#555" }}>ملاحظات: {opportunity.notes}</p>}
              <div className="signature-area" style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
                <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
                  <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>توقيع المسؤول</div>
                </div>
                <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
                  <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>توقيع العميل</div>
                </div>
              </div>
            </PrintDocument>
          </div>
        </>
      )}
    </>
  );
}
