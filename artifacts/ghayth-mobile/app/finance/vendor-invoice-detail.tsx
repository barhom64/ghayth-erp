/**
 * تفاصيل فاتورة المورد
 * GET /api/finance/vendor-invoices/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';
import { useQueryClient } from '@tanstack/react-query';

interface VendorInvoice {
  id: number;
  ref?: string;
  invoiceNumber?: string;
  vendorName?: string;
  vendorId?: number;
  status?: string;
  date?: string;
  dueDate?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  paymentTerms?: string;
  purchaseOrderRef?: string;
  description?: string;
  notes?: string;
  lines?: InvoiceLine[];
}

interface InvoiceLine {
  id?: number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function VendorInvoiceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: invoice, isLoading } = useList<VendorInvoice>(`/api/finance/vendor-invoices/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل فاتورة المورد…" />;
  if (!invoice) return <GEmptyState icon="receipt-outline" title="فاتورة غير موجودة" description="تعذّر العثور على بيانات الفاتورة" />;

  const ref = invoice.ref ?? invoice.invoiceNumber ?? `#${invoice.id}`;
  const st = statusBadge(invoice.status ?? '');
  const currency = invoice.currency;
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.balanceDue && invoice.balanceDue > 0;
  const lines = invoice.lines ?? [];
  const paidPct = invoice.totalAmount ? Math.round(((invoice.paidAmount ?? 0) / invoice.totalAmount) * 100) : 0;

  async function approve() {
    await apiFetch(`/api/finance/vendor-invoices/${id}/approve`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/finance/vendor-invoices/${id}`] });
  }

  const canApprove = invoice.status === 'draft' || invoice.status === 'مسودة' || invoice.status === 'pending';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `فاتورة مورد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{invoice.vendorName ?? '—'}</Text>
          {invoice.invoiceNumber ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>#{invoice.invoiceNumber}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(invoice.totalAmount, currency)}</Text>
          {invoice.balanceDue !== undefined && invoice.balanceDue > 0 ? (
            <Text style={{ fontSize: 12, color: '#FFCCCC', marginTop: 2 }}>متبقي: {fmtMoney(invoice.balanceDue, currency)}</Text>
          ) : null}
        </View>
      </View>

      {/* شريط الدفع */}
      {invoice.totalAmount ? (
        <View>
          <View style={{ height: 6, backgroundColor: c.border }}>
            <View style={{ height: 6, width: `${paidPct}%`, backgroundColor: '#22C55E' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>مدفوع {paidPct}%</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>{fmtMoney(invoice.paidAmount, currency)} / {fmtMoney(invoice.totalAmount, currency)}</Text>
          </View>
        </View>
      ) : null}

      {isOverdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>فاتورة متأخرة — استحقاق: {fmtDate(invoice.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الفاتورة', value: invoice.date ? fmtDate(invoice.date) : undefined },
            { label: 'تاريخ الاستحقاق', value: invoice.dueDate ? fmtDate(invoice.dueDate) : undefined },
            { label: 'شروط الدفع', value: invoice.paymentTerms },
            { label: 'مرجع أمر الشراء', value: invoice.purchaseOrderRef },
            { label: 'المجموع الفرعي', value: fmtMoney(invoice.subtotal, currency) },
            { label: 'ضريبة القيمة المضافة', value: invoice.taxAmount !== undefined ? fmtMoney(invoice.taxAmount, currency) : undefined },
            { label: 'الإجمالي', value: fmtMoney(invoice.totalAmount, currency) },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, fontWeight: row.label === 'الإجمالي' ? '700' : '400', color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {lines.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">بنود الفاتورة</GText>
            {lines.map((line, i) => (
              <View key={line.id ?? i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{fmtMoney(line.total, currency)}</Text>
                  <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', flex: 1, marginRight: 8 }}>{line.description ?? '—'}</Text>
                </View>
                {line.quantity !== undefined ? (
                  <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{line.quantity} × {fmtMoney(line.unitPrice, currency)}</Text>
                ) : null}
              </View>
            ))}
          </GCard>
        )}

        {invoice.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{invoice.notes}</Text>
          </GCard>
        ) : null}

        {canApprove && (
          <View
            style={{ backgroundColor: '#22C55E', borderRadius: 12, padding: 16, alignItems: 'center' }}
            // @ts-ignore
            onStartShouldSetResponder={() => true}
            onResponderRelease={approve}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>اعتماد الفاتورة</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
