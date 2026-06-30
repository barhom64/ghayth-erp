/**
 * كشف الراتب الشخصي — عرض كشف راتب الموظف مع تنقل بين الأشهر
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayslipData {
  period?: string;
  baseSalary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  overtimePay?: number;
  grossSalary?: number;
  gosi?: number;
  lateDeduction?: number;
  absenceDeduction?: number;
  otherDeductions?: number;
  advanceDeduction?: number;
  totalDeductions?: number;
  netSalary?: number;
  status?: string;
}

interface MySpacePayslipResp { data?: PayslipData | null }

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodAr(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
}

function formatAmount(val: number | undefined): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
}

function LineRow({ label, amount, isDeduction, c }: {
  label: string; amount: number | undefined; isDeduction?: boolean;
  c: ReturnType<typeof useColors>;
}) {
  if (!amount) return null;
  return (
    <View style={styles.lineRow}>
      <Text style={[styles.lineAmount, { color: isDeduction ? c.danger : c.text }]}>{formatAmount(amount)}</Text>
      <Text style={[styles.lineLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function PayslipScreen() {
  const c = useColors();
  const [period, setPeriod] = useState(currentPeriod());
  const { data: resp, isLoading, isError } = useList<MySpacePayslipResp>('/api/my-space/payslip', { period });

  const isFuture = period >= currentPeriod();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'كشف الراتب' }} />

      {/* تنقل الأشهر */}
      <View style={[styles.periodNav, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Pressable
          onPress={() => setPeriod(p => shiftPeriod(p, 1))}
          disabled={isFuture}
          style={({ pressed }) => [styles.navBtn, { opacity: isFuture ? 0.3 : pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-forward" size={20} color={c.text} />
        </Pressable>
        <Text style={[styles.periodLabel, { color: c.text }]}>{formatPeriodAr(period)}</Text>
        <Pressable
          onPress={() => setPeriod(p => shiftPeriod(p, -1))}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={20} color={c.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ تحميل كشف الراتب…" />
      ) : isError ? (
        <GEmptyState
          icon="alert-circle-outline"
          title="تعذّر تحميل كشف الراتب"
          description="تحقق من اتصالك بالإنترنت وحاول مجدداً"
        />
      ) : !resp?.data ? (
        <GEmptyState
          icon="wallet-outline"
          title="لا يوجد كشف راتب"
          description={`لم يتم إصدار كشف راتب لشهر ${formatPeriodAr(period)}`}
        />
      ) : (
        <>
          {/* المستحقات */}
          <GCard style={styles.section}>
            <GText variant="subheading" style={styles.sectionTitle}>المستحقات</GText>
            <LineRow label="الراتب الأساسي" amount={resp.data.baseSalary} c={c} />
            <LineRow label="بدل السكن" amount={resp.data.housingAllowance} c={c} />
            <LineRow label="بدل النقل" amount={resp.data.transportAllowance} c={c} />
            <LineRow label="الوقت الإضافي" amount={resp.data.overtimePay} c={c} />
            <View style={[styles.totalRow, { borderTopColor: c.border }]}>
              <Text style={[styles.totalAmount, { color: '#22C55E' }]}>{formatAmount(resp.data.grossSalary)}</Text>
              <Text style={[styles.totalLabel, { color: c.text }]}>إجمالي المستحقات</Text>
            </View>
          </GCard>

          {/* الاستقطاعات */}
          {(resp.data.totalDeductions ?? 0) > 0 && (
            <GCard style={styles.section}>
              <GText variant="subheading" style={styles.sectionTitle}>الاستقطاعات</GText>
              <LineRow label="التأمينات الاجتماعية (GOSI)" amount={resp.data.gosi} isDeduction c={c} />
              <LineRow label="استقطاع التأخير" amount={resp.data.lateDeduction} isDeduction c={c} />
              <LineRow label="استقطاع الغياب" amount={resp.data.absenceDeduction} isDeduction c={c} />
              <LineRow label="استقطاعات أخرى" amount={resp.data.otherDeductions} isDeduction c={c} />
              <LineRow label="استقطاع السلفة" amount={resp.data.advanceDeduction} isDeduction c={c} />
              <View style={[styles.totalRow, { borderTopColor: c.border }]}>
                <Text style={[styles.totalAmount, { color: c.danger }]}>{formatAmount(resp.data.totalDeductions)}</Text>
                <Text style={[styles.totalLabel, { color: c.text }]}>إجمالي الاستقطاعات</Text>
              </View>
            </GCard>
          )}

          {/* الصافي */}
          <GCard style={[styles.netCard, { backgroundColor: c.primary }]}>
            <GText variant="caption" color={c.onPrimary + 'CC'} style={{ textAlign: 'center' }}>صافي الراتب</GText>
            <Text style={[styles.netAmount, { color: c.onPrimary }]}>{formatAmount(resp.data.netSalary)}</Text>
          </GCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  periodNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 10,
  },
  navBtn: { padding: 8 },
  periodLabel: { fontSize: 16, fontWeight: '700' },
  section: {},
  sectionTitle: { marginBottom: 12, textAlign: 'right' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  lineLabel: { fontSize: 14, textAlign: 'right' },
  lineAmount: { fontSize: 14, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
  totalLabel: { fontSize: 15, fontWeight: '700', textAlign: 'right' },
  totalAmount: { fontSize: 15, fontWeight: '700' },
  netCard: { paddingVertical: 24, alignItems: 'center' },
  netAmount: { fontSize: 28, fontWeight: '800', marginTop: 8 },
});
