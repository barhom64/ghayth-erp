/**
 * تفاصيل فاتورة نُسك
 * GET /api/umrah/nusk-invoices/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface NuskInvoice {
  id: number;
  nuskInvoiceNumber?: string;
  agentName?: string;
  totalAmount?: number;
  paidAmount?: number;
  currency?: string;
  nuskStatus?: string;
  status?: string;
  issueDate?: string;
  pilgrims?: number;
  packageName?: string;
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

export default function NuskInvoiceDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: inv, isLoading } = useList<NuskInvoice>(`/api/umrah/nusk-invoices/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات فاتورة نُسك…" />;
  if (!inv) return <GEmptyState icon="documents-outline" title="فاتورة غير موجودة" description="تعذّر العثور على بيانات فاتورة نُسك" />;

  const statusKey = inv.nuskStatus ?? inv.status ?? '';
  const st = statusBadge(statusKey);
  const settled = statusKey === 'settled' || statusKey === 'paid';
  const total = inv.totalAmount ?? 0;
  const paid = inv.paidAmount ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: inv.nuskInvoiceNumber ?? 'فاتورة نُسك' }} />

      <View style={[styles.header, { backgroundColor: settled ? '#16A34A' : '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{inv.nuskInvoiceNumber ?? '—'}</Text>
          {inv.agentName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{inv.agentName}</Text> : null}
          {inv.packageName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{inv.packageName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(total, inv.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الإجمالي</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${pct}%`, backgroundColor: pct === 100 ? '#22C55E' : '#7C3AED', borderRadius: 4 }} />
        </View>

        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المدفوع</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#16A34A' }}>{fmtMoney(paid, inv.currency)}</Text>
          </GCard>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المتبقي</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444' }}>{fmtMoney(total - paid, inv.currency)}</Text>
          </GCard>
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الوكيل', value: inv.agentName },
            { label: 'الباقة', value: inv.packageName },
            { label: 'عدد الحجاج', value: inv.pilgrims !== undefined ? String(inv.pilgrims) : undefined },
            { label: 'تاريخ الإصدار', value: inv.issueDate ? fmtDate(inv.issueDate) : undefined },
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

        <GButton title="فاتورة نسك جديدة" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/umrah/nusk-invoice-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
