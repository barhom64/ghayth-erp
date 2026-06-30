/**
 * تفاصيل سلفة الراتب
 * GET /api/finance/salary-advances/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface SalaryAdvance {
  id: number;
  ref?: string;
  employeeName?: string;
  amount?: number;
  remainingAmount?: number;
  paidAmount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  deductionStartDate?: string;
  monthlyDeduction?: number;
  reason?: string;
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

export default function SalaryAdvanceDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: adv, isLoading } = useList<SalaryAdvance>(`/api/finance/salary-advances/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات السلفة…" />;
  if (!adv) return <GEmptyState icon="wallet-outline" title="سلفة غير موجودة" description="تعذّر العثور على بيانات سلفة الراتب" />;

  const st = statusBadge(adv.status ?? '');
  const paidPct = adv.amount && adv.paidAmount !== undefined ? Math.min(100, Math.round((adv.paidAmount / adv.amount) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: adv.ref ?? 'سلفة راتب' }} />

      <View style={[styles.header, { backgroundColor: '#0EA5E9' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{adv.employeeName ?? '—'}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(adv.amount, adv.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مبلغ السلفة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {adv.paidAmount !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(adv.paidAmount, adv.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المسدَّد</Text>
            </GCard>
          )}
          {adv.remainingAmount !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#EF4444' }}>{fmtMoney(adv.remainingAmount, adv.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المتبقي</Text>
            </GCard>
          )}
        </View>

        {adv.amount && adv.paidAmount !== undefined ? (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${paidPct}%`, backgroundColor: '#22C55E', borderRadius: 3 }} />
          </View>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الطلب', value: adv.createdAt ? fmtDate(adv.createdAt) : undefined },
            { label: 'بداية الاستقطاع', value: adv.deductionStartDate ? fmtDate(adv.deductionStartDate) : undefined },
            { label: 'القسط الشهري', value: adv.monthlyDeduction !== undefined ? fmtMoney(adv.monthlyDeduction, adv.currency) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {adv.reason ? (
          <GCard>
            <GText variant="caption" color="muted">السبب</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{adv.reason}</Text>
          </GCard>
        ) : null}

        {adv.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{adv.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="سلفة راتب جديدة" icon="barcode-outline" variant="secondary" onPress={() => router.push('/finance/salary-advance-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
