/**
 * تفاصيل وثيقة التأمين المالية (تأمين عقاري / صحي)
 * GET /api/finance/insurance/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface InsurancePolicy {
  id: number;
  ref?: string;
  type?: string;
  provider?: string;
  policyNumber?: string;
  insuredName?: string;
  premium?: number;
  coverageAmount?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  notes?: string;
  amortizationMonths?: number;
  monthlyAmortization?: number;
}

const TYPE_LABEL: Record<string, string> = {
  property: 'تأمين عقاري',
  medical: 'تأمين طبي',
  vehicle: 'تأمين مركبة',
  life: 'تأمين على الحياة',
  general: 'تأمين عام',
};

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function InsuranceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: policy, isLoading } = useList<InsurancePolicy>(`/api/finance/insurance/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل وثيقة التأمين…" />;
  if (!policy) return <GEmptyState icon="shield-outline" title="غير موجودة" description="لم يُعثر على وثيقة التأمين" />;

  const st = statusBadge(policy.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `وثيقة تأمين ${policy.ref ?? `#${policy.id}`}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>
            {TYPE_LABEL[policy.type ?? ''] ?? policy.type ?? 'تأمين'}
          </Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>{policy.provider ?? '—'}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(policy.premium, policy.currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>قسط التأمين</Text>
        </View>
      </View>

      <View style={[styles.summaryRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtMoney(policy.coverageAmount, policy.currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>مبلغ التغطية</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtDate(policy.startDate)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>تاريخ البداية</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtDate(policy.endDate)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>تاريخ الانتهاء</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم الوثيقة', value: policy.policyNumber },
            { label: 'المؤمَّن عليه', value: policy.insuredName },
            { label: 'مدة الإطفاء', value: policy.amortizationMonths ? `${policy.amortizationMonths} شهر` : undefined },
            { label: 'إطفاء شهري', value: fmtMoney(policy.monthlyAmortization, policy.currency) },
            { label: 'ملاحظات', value: policy.notes },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, marginVertical: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
