/**
 * كشف الراتب الشخصي — عرض آخر راتب للموظف من /api/my-space/payslip
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayslipLine { label: string; amount: number; isDeduction?: boolean }

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
  const { data: resp, isLoading } = useList<MySpacePayslipResp>('/api/my-space/payslip');

  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف الراتب…" />;

  const ps = resp?.data;

  if (!ps) {
    return (
      <GEmptyState
        icon="wallet-outline"
        title="لا يوجد كشف راتب"
        description="لم يتم إصدار كشف راتب بعد لهذا الشهر"
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'كشف الراتب' }} />

      {/* الفترة */}
      <GCard style={styles.headerCard}>
        <GText variant="heading" style={{ textAlign: 'center' }}>كشف الراتب</GText>
        {ps.period ? <GText variant="label" color={c.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>{ps.period}</GText> : null}
      </GCard>

      {/* المستحقات */}
      <GCard style={styles.section}>
        <GText variant="subheading" style={styles.sectionTitle}>المستحقات</GText>
        <LineRow label="الراتب الأساسي" amount={ps.baseSalary} c={c} />
        <LineRow label="بدل السكن" amount={ps.housingAllowance} c={c} />
        <LineRow label="بدل النقل" amount={ps.transportAllowance} c={c} />
        <LineRow label="الوقت الإضافي" amount={ps.overtimePay} c={c} />
        <View style={[styles.totalRow, { borderTopColor: c.border }]}>
          <Text style={[styles.totalAmount, { color: '#22C55E' }]}>{formatAmount(ps.grossSalary)}</Text>
          <Text style={[styles.totalLabel, { color: c.text }]}>إجمالي المستحقات</Text>
        </View>
      </GCard>

      {/* الاستقطاعات */}
      {(ps.totalDeductions ?? 0) > 0 && (
        <GCard style={styles.section}>
          <GText variant="subheading" style={styles.sectionTitle}>الاستقطاعات</GText>
          <LineRow label="التأمينات الاجتماعية (GOSI)" amount={ps.gosi} isDeduction c={c} />
          <LineRow label="استقطاع التأخير" amount={ps.lateDeduction} isDeduction c={c} />
          <LineRow label="استقطاع الغياب" amount={ps.absenceDeduction} isDeduction c={c} />
          <LineRow label="استقطاعات أخرى" amount={ps.otherDeductions} isDeduction c={c} />
          <LineRow label="استقطاع السلفة" amount={ps.advanceDeduction} isDeduction c={c} />
          <View style={[styles.totalRow, { borderTopColor: c.border }]}>
            <Text style={[styles.totalAmount, { color: c.danger }]}>{formatAmount(ps.totalDeductions)}</Text>
            <Text style={[styles.totalLabel, { color: c.text }]}>إجمالي الاستقطاعات</Text>
          </View>
        </GCard>
      )}

      {/* الصافي */}
      <GCard style={[styles.netCard, { backgroundColor: c.primary }]}>
        <GText variant="caption" color={c.onPrimary + 'CC'} style={{ textAlign: 'center' }}>صافي الراتب</GText>
        <Text style={[styles.netAmount, { color: c.onPrimary }]}>{formatAmount(ps.netSalary)}</Text>
      </GCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  headerCard: { alignItems: 'center', paddingVertical: 20 },
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
