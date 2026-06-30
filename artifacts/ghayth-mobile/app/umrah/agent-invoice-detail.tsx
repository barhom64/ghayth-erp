/**
 * تفاصيل فاتورة الوكيل
 * GET /api/umrah/agent-invoices/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface AgentInvoice {
  id: number;
  ref?: string;
  invoiceNumber?: string;
  agentName?: string;
  seasonTitle?: string;
  total?: number;
  amount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  currency?: string;
  status?: string;
  date?: string;
  createdAt?: string;
  mutamerCount?: number;
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

export default function AgentInvoiceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: inv, isLoading } = useList<AgentInvoice>(`/api/umrah/agent-invoices/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الفاتورة…" />;
  if (!inv) return <GEmptyState icon="receipt-outline" title="فاتورة غير موجودة" description="تعذّر العثور على بيانات فاتورة الوكيل" />;

  const st = statusBadge(inv.status ?? '');
  const total = inv.total ?? inv.amount ?? 0;
  const paidPct = total && inv.paidAmount !== undefined ? Math.min(100, Math.round((inv.paidAmount / total) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: inv.invoiceNumber ?? inv.ref ?? 'فاتورة وكيل' }} />

      <View style={[styles.header, { backgroundColor: '#059669' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{inv.agentName ?? '—'}</Text>
          {inv.seasonTitle ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{inv.seasonTitle}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(total, inv.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الإجمالي</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(inv.paidAmount !== undefined || inv.remainingAmount !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {inv.paidAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(inv.paidAmount, inv.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المُسدَّد</Text>
              </GCard>
            )}
            {inv.remainingAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#EF4444' }}>{fmtMoney(inv.remainingAmount, inv.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المتبقي</Text>
              </GCard>
            )}
          </View>
        )}

        {total && inv.paidAmount !== undefined ? (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${paidPct}%`, backgroundColor: '#22C55E', borderRadius: 3 }} />
          </View>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الوكيل', value: inv.agentName },
            { label: 'الموسم', value: inv.seasonTitle },
            { label: 'التاريخ', value: inv.date ? fmtDate(inv.date) : inv.createdAt ? fmtDate(inv.createdAt) : undefined },
            { label: 'عدد المعتمرين', value: inv.mutamerCount !== undefined ? String(inv.mutamerCount) : undefined },
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
