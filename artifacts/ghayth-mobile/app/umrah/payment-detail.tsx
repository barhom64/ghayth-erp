/**
 * تفاصيل دفعة العمرة
 * GET /api/umrah/payments/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahPayment {
  id: number;
  ref?: string;
  pilgrimName?: string;
  agentName?: string;
  amount?: number;
  currency?: string;
  method?: string;
  status?: string;
  paidAt?: string;
  invoiceRef?: string;
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

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  bank_transfer: 'تحويل بنكي',
  card: 'بطاقة',
  check: 'شيك',
};

export default function UmrahPaymentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: pay, isLoading } = useList<UmrahPayment>(`/api/umrah/payments/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الدفعة…" />;
  if (!pay) return <GEmptyState icon="barcode-outline" title="دفعة غير موجودة" description="تعذّر العثور على بيانات الدفعة" />;

  const st = statusBadge(pay.status ?? '');
  const confirmed = pay.status === 'confirmed' || pay.status === 'settled';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: pay.ref ?? 'دفعة عمرة' }} />

      <View style={[styles.header, { backgroundColor: confirmed ? '#16A34A' : '#0F766E' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{fmtMoney(pay.amount, pay.currency)}</Text>
          {pay.pilgrimName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{pay.pilgrimName}</Text> : null}
          {pay.agentName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{pay.agentName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cash-outline" size={36} color="#FFF" />
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المعتمر / الحاج', value: pay.pilgrimName },
            { label: 'الوكيل', value: pay.agentName },
            { label: 'طريقة الدفع', value: pay.method ? (METHOD_LABELS[pay.method] ?? pay.method) : undefined },
            { label: 'تاريخ الدفع', value: pay.paidAt ? fmtDate(pay.paidAt) : undefined },
            { label: 'رقم الفاتورة', value: pay.invoiceRef },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {pay.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{pay.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="دفعة جديدة" icon="barcode-outline" variant="secondary" onPress={() => router.push('/umrah/payment-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
