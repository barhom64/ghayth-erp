/**
 * تفاصيل عمولة الوكيل — مسيّر العمولات
 * GET /api/umrah/commissions/:id
 */
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Commission {
  id: number;
  ref?: string;
  agentName?: string;
  subAgentName?: string;
  groupName?: string;
  amount?: number;
  currency?: string;
  rate?: number;
  baseAmount?: number;
  status?: string;
  paidAt?: string;
  dueDate?: string;
  notes?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function CommissionDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: comm, isLoading, refetch } = useList<Commission>(`/api/umrah/commissions/${id}`);
  const [acting, setActing] = React.useState(false);

  const doAction = async () => {
    Alert.alert('تأكيد الدفع', 'هل تريد تأكيد دفع العمولة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد', onPress: async () => {
          setActing(true);
          try {
            await apiFetch(`/api/umrah/commissions/${id}/pay`, { method: 'POST', body: JSON.stringify({}) });
            await refetch();
          } catch {
            Alert.alert('خطأ', 'تعذّر تأكيد الدفع');
          } finally {
            setActing(false);
          }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل العمولة…" />;
  if (!comm) return <GEmptyState icon="barcode-outline" title="غير موجودة" description="لم يُعثر على العمولة" />;

  const st = statusBadge(comm.status ?? '');
  const isPending = comm.status === 'pending' || comm.status === 'approved';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `عمولة ${comm.ref ?? `#${comm.id}`}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>
            {comm.agentName ?? comm.subAgentName ?? '—'}
          </Text>
          {comm.groupName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>{comm.groupName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(comm.amount, comm.currency)}</Text>
          {comm.rate ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', marginTop: 2 }}>{comm.rate}%</Text> : null}
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المرجع', value: comm.ref },
            { label: 'الأساس', value: fmtMoney(comm.baseAmount, comm.currency) },
            { label: 'استحقاق في', value: fmtDate(comm.dueDate) },
            { label: 'دُفع في', value: fmtDate(comm.paidAt) },
            { label: 'ملاحظات', value: comm.notes },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {isPending && (
          <GButton title="تأكيد الدفع" onPress={doAction} loading={acting} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
