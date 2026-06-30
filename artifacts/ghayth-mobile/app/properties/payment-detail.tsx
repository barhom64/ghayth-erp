/**
 * تفاصيل دفعة الإيجار
 * GET /api/properties/payments/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface RentPayment {
  id: number;
  ref?: string;
  reference?: string;
  tenantName?: string;
  unitName?: string;
  amount?: number;
  currency?: string;
  status?: string;
  dueDate?: string;
  paidDate?: string;
  method?: string;
  periodLabel?: string;
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

export default function RentPaymentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: pmt, isLoading } = useList<RentPayment>(`/api/properties/payments/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الدفعة…" />;
  if (!pmt) return <GEmptyState icon="barcode-outline" title="دفعة غير موجودة" description="تعذّر العثور على بيانات دفعة الإيجار" />;

  const st = statusBadge(pmt.status ?? '');
  const dueDate = pmt.dueDate ? new Date(pmt.dueDate) : null;
  const overdue = dueDate && dueDate < new Date() && !pmt.paidDate;
  const paid = !!pmt.paidDate;

  const headerColor = paid ? '#16A34A' : overdue ? '#EF4444' : '#0EA5E9';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: pmt.ref ?? pmt.reference ?? 'دفعة إيجار' }} />

      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{pmt.tenantName ?? '—'}</Text>
          {pmt.unitName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{pmt.unitName}</Text> : null}
          {pmt.periodLabel ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{pmt.periodLabel}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(pmt.amount, pmt.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مبلغ الدفعة</Text>
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>دفعة متأخرة — استحقاق: {fmtDate(pmt.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المستأجر', value: pmt.tenantName },
            { label: 'الوحدة', value: pmt.unitName },
            { label: 'طريقة الدفع', value: pmt.method },
            { label: 'تاريخ الاستحقاق', value: pmt.dueDate ? fmtDate(pmt.dueDate) : undefined },
            { label: 'تاريخ السداد', value: pmt.paidDate ? fmtDate(pmt.paidDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {pmt.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{pmt.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="دفعة إيجار جديدة" icon="barcode-outline" variant="secondary" onPress={() => router.push('/properties/payment-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
