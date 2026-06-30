/**
 * تفاصيل مسيّر الرواتب — بنود الدخل والخصومات وإجراءات الاعتماد
 * GET /api/hr/payroll/:id
 * POST /api/hr/payroll/:id/approve
 * POST /api/hr/payroll/:id/post
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PayrollRun {
  id: number;
  reference?: string;
  period?: string;
  month?: string;
  year?: number;
  status?: string;
  employeeCount?: number;
  totalGross?: number;
  totalDeductions?: number;
  totalNet?: number;
  currency?: string;
  approvedBy?: string;
  approvedAt?: string;
  processedAt?: string;
  lines?: PayrollLine[];
}

interface PayrollLine {
  id?: number;
  employeeName?: string;
  grossSalary?: number;
  deductions?: number;
  netSalary?: number;
  allowances?: number;
  overtimeAmount?: number;
  status?: string;
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

export default function PayrollDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: run, isLoading, refetch } = useList<PayrollRun>(`/api/hr/payroll/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/hr/payroll/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل مسيّر الرواتب…" />;
  if (!run) return <GEmptyState icon="wallet-outline" title="مسيّر غير موجود" description="تعذّر العثور على بيانات مسيّر الرواتب" />;

  const ref = run.reference ?? `#${run.id}`;
  const st = statusBadge(run.status ?? '');
  const currency = run.currency;
  const lines = run.lines ?? [];
  const isDraft = run.status === 'draft' || run.status === 'pending';
  const isApproved = run.status === 'approved';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `مسيّر ${run.period ?? ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>مسيّر {run.period ?? ref}</Text>
          {run.employeeCount ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{run.employeeCount} موظف</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(run.totalNet, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>صافي الرواتب</Text>
        </View>
      </View>

      {/* ملخص مالي */}
      <View style={[styles.summaryRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtMoney(run.totalGross, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>الإجمالي</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>{fmtMoney(run.totalDeductions, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>الخصومات</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>{fmtMoney(run.totalNet, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>الصافي</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* المعلومات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'معتمد من', value: run.approvedBy },
            { label: 'تاريخ الاعتماد', value: run.approvedAt ? fmtDate(run.approvedAt) : undefined },
            { label: 'تاريخ المعالجة', value: run.processedAt ? fmtDate(run.processedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* سطور الموظفين */}
        {lines.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>بنود الرواتب</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>الموظف</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>الإجمالي</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 80, textAlign: 'left' }}>الصافي</Text>
              </View>
              {lines.map((line, i) => (
                <View key={line.id ?? i} style={[styles.lineRow, { borderBottomColor: c.border }, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1, textAlign: 'right' }}>{line.employeeName ?? '—'}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, width: 80, textAlign: 'left' }}>{fmtMoney(line.grossSalary, currency)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E', width: 80, textAlign: 'left' }}>{fmtMoney(line.netSalary, currency)}</Text>
                </View>
              ))}
            </GCard>
          </>
        )}

        {/* إجراءات */}
        {isDraft && (
          <GButton title="اعتماد مسيّر الرواتب" onPress={() => doAction('approve', 'اعتماد مسيّر الرواتب')} loading={acting} />
        )}
        {isApproved && (
          <GButton title="ترحيل المسيّر" variant="secondary" onPress={() => doAction('post', 'ترحيل مسيّر الرواتب')} loading={acting} />
        )}
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
  lineHeader: { flexDirection: 'row', padding: 8, gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderBottomWidth: 1 },
});
