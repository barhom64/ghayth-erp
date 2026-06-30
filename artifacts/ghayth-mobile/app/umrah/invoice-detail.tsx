/**
 * تفاصيل فاتورة العمرة
 * GET /api/umrah/invoices/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahInvoice {
  id: number;
  ref?: string;
  clientName?: string;
  subAgentName?: string;
  total?: number;
  paid?: number;
  remaining?: number;
  currency?: string;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
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

export default function UmrahInvoiceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: inv, isLoading } = useList<UmrahInvoice>(`/api/umrah/invoices/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الفاتورة…" />;
  if (!inv) return <GEmptyState icon="receipt-outline" title="فاتورة غير موجودة" description="تعذّر العثور على بيانات الفاتورة" />;

  const st = statusBadge(inv.status ?? '');
  const paid = inv.status === 'paid' || inv.status === 'settled';
  const total = inv.total ?? 0;
  const paidAmt = inv.paid ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((paidAmt / total) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: inv.ref ?? 'فاتورة عمرة' }} />

      <View style={[styles.header, { backgroundColor: paid ? '#16A34A' : '#0284C7' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{inv.ref ?? '—'}</Text>
          {inv.clientName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{inv.clientName}</Text> : null}
          {inv.subAgentName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{inv.subAgentName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(inv.total, inv.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الإجمالي</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${pct}%`, backgroundColor: pct === 100 ? '#22C55E' : '#0284C7', borderRadius: 4 }} />
        </View>

        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المدفوع</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#16A34A' }}>{fmtMoney(paidAmt, inv.currency)}</Text>
          </GCard>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المتبقي</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444' }}>{fmtMoney(inv.remaining ?? (total - paidAmt), inv.currency)}</Text>
          </GCard>
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل', value: inv.clientName },
            { label: 'الوكيل الفرعي', value: inv.subAgentName },
            { label: 'تاريخ الإصدار', value: inv.issueDate ? fmtDate(inv.issueDate) : undefined },
            { label: 'تاريخ الاستحقاق', value: inv.dueDate ? fmtDate(inv.dueDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {inv.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{inv.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
