/**
 * تفاصيل كشف الراتب
 * GET /api/hr/payroll/slips/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Payslip {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  period?: string;
  month?: string;
  status?: string;
  basicSalary?: number;
  allowances?: number;
  deductions?: number;
  netSalary?: number;
  currency?: string;
  paidAt?: string;
  allowanceDetails?: { name: string; amount: number }[];
  deductionDetails?: { name: string; amount: number }[];
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

export default function PayslipDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: slip, isLoading } = useList<Payslip>(`/api/hr/payroll/slips/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف الراتب…" />;
  if (!slip) return <GEmptyState icon="document-text-outline" title="كشف غير موجود" description="تعذّر العثور على كشف الراتب" />;

  const st = statusBadge(slip.status ?? '');
  const allowances = slip.allowanceDetails ?? [];
  const deductions = slip.deductionDetails ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `راتب ${slip.period ?? slip.month ?? ''}` }} />

      <View style={[styles.header, { backgroundColor: '#059669' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{slip.employeeName ?? '—'}</Text>
          {slip.employeeNumber ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{slip.employeeNumber}</Text> : null}
          {(slip.period ?? slip.month) ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{slip.period ?? slip.month}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(slip.netSalary, slip.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>صافي الراتب</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* ملخص */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(slip.basicSalary, slip.currency)}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>الراتب الأساسي</Text>
          </GCard>
          {slip.allowances !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#3B82F6' }}>{fmtMoney(slip.allowances, slip.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>البدلات</Text>
            </GCard>
          )}
          {slip.deductions !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#EF4444' }}>{fmtMoney(slip.deductions, slip.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>الاستقطاعات</Text>
            </GCard>
          )}
        </View>

        {allowances.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">البدلات</GText>
            {allowances.map((a, i) => (
              <View key={i} style={[styles.infoRow, { borderBottomColor: c.border }, i < allowances.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: '#3B82F6', fontWeight: '600', textAlign: 'right', flex: 1 }}>{fmtMoney(a.amount, slip.currency)}</Text>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{a.name}</Text>
              </View>
            ))}
          </GCard>
        )}

        {deductions.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الاستقطاعات</GText>
            {deductions.map((d, i) => (
              <View key={i} style={[styles.infoRow, { borderBottomColor: c.border }, i < deductions.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: '#EF4444', fontWeight: '600', textAlign: 'right', flex: 1 }}>{fmtMoney(d.amount, slip.currency)}</Text>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{d.name}</Text>
              </View>
            ))}
          </GCard>
        )}

        {slip.paidAt ? (
          <GCard>
            <GText variant="caption" color="muted">تاريخ الصرف</GText>
            <Text style={{ fontSize: 14, color: c.text, textAlign: 'right' }}>{fmtDate(slip.paidAt)}</Text>
          </GCard>
        ) : null}

        <GButton title="تصدير كشف الراتب" icon="download-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/payslip-detail' as never, params: { id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
});
