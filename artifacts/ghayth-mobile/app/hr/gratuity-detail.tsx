/**
 * تفاصيل مكافأة نهاية الخدمة
 * GET /api/hr/gratuity/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface GratuityRecord {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  status?: string;
  hireDate?: string;
  lastWorkingDay?: string;
  yearsOfService?: number;
  monthsOfService?: number;
  exitType?: string;
  gratuityAmount?: number;
  totalAmount?: number;
  currency?: string;
  salaryUsed?: number;
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

export default function GratuityDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: rec, isLoading } = useList<GratuityRecord>(`/api/hr/gratuity/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المكافأة…" />;
  if (!rec) return <GEmptyState icon="ribbon-outline" title="سجل غير موجود" description="تعذّر العثور على بيانات مكافأة نهاية الخدمة" />;

  const st = statusBadge(rec.status ?? '');
  const amount = rec.gratuityAmount ?? rec.totalAmount ?? 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: rec.employeeName ?? 'مكافأة نهاية الخدمة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#D97706' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{rec.employeeName ?? '—'}</Text>
          {rec.employeeNumber ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{rec.employeeNumber}</Text> : null}
          {rec.exitType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{rec.exitType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(amount, rec.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>المكافأة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* KPI خدمة */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.brand }}>{rec.yearsOfService ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>سنوات الخدمة</Text>
          </GCard>
          <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#D97706' }}>{fmtMoney(amount, rec.currency)}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>إجمالي المكافأة</Text>
          </GCard>
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ التعيين', value: rec.hireDate ? fmtDate(rec.hireDate) : undefined },
            { label: 'آخر يوم عمل', value: rec.lastWorkingDay ? fmtDate(rec.lastWorkingDay) : undefined },
            { label: 'سنوات الخدمة', value: rec.yearsOfService !== undefined ? `${rec.yearsOfService} سنة` + (rec.monthsOfService ? ` و${rec.monthsOfService} شهر` : '') : undefined },
            { label: 'نوع الإنهاء', value: rec.exitType },
            { label: 'الراتب المعتمد', value: rec.salaryUsed !== undefined ? fmtMoney(rec.salaryUsed, rec.currency) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {rec.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{rec.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="احتساب مكافأة نهاية خدمة" icon="calculator-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/gratuity-detail' as never, params: { id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
