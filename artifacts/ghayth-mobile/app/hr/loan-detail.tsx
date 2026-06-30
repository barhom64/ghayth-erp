/**
 * تفاصيل السلفة / القرض
 * GET /api/hr/loans/:id
 * POST /api/hr/loans/:id/approve
 * POST /api/hr/loans/:id/reject
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Loan {
  id: number;
  ref?: string;
  employeeName?: string;
  amount?: number;
  remainingAmount?: number;
  installments?: number;
  installmentAmount?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  type?: string;
  purpose?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  currency?: string;
  schedule?: InstallmentRow[];
}

interface InstallmentRow {
  installmentNo?: number;
  dueDate?: string;
  amount?: number;
  status?: string;
  paidDate?: string;
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

export default function LoanDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: loan, isLoading, refetch } = useList<Loan>(`/api/hr/loans/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/hr/loans/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل السلفة…" />;
  if (!loan) return <GEmptyState icon="card-outline" title="سلفة غير موجودة" description="تعذّر العثور على بيانات السلفة" />;

  const ref = loan.ref ?? `#${loan.id}`;
  const st = statusBadge(loan.status ?? '');
  const currency = loan.currency;
  const schedule = loan.schedule ?? [];
  const paidCount = schedule.filter(s => s.status === 'paid').length;
  const paidPct = schedule.length > 0 ? (paidCount / schedule.length) * 100 : 0;

  const isPending = loan.status === 'pending' || loan.status === 'draft';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `سلفة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{loan.employeeName ?? '—'}</Text>
          {loan.type ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{loan.type}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(loan.amount, currency)}</Text>
        </View>
      </View>

      {/* شريط السداد */}
      {schedule.length > 0 && (
        <View style={[styles.progressBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: paidPct >= 100 ? '#22C55E' : c.brand }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: '#22C55E', fontWeight: '600' }}>مدفوع: {paidCount}/{schedule.length} قسط</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>متبقي: {fmtMoney(loan.remainingAmount, currency)}</Text>
          </View>
        </View>
      )}

      <View style={{ padding: 16, gap: 16 }}>
        {/* المعلومات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المبلغ الإجمالي', value: fmtMoney(loan.amount, currency) },
            { label: 'المتبقي', value: fmtMoney(loan.remainingAmount, currency) },
            { label: 'عدد الأقساط', value: loan.installments ? `${loan.installments} قسط` : undefined },
            { label: 'قيمة القسط', value: fmtMoney(loan.installmentAmount, currency) },
            { label: 'تاريخ البداية', value: fmtDate(loan.startDate) },
            { label: 'تاريخ الانتهاء', value: fmtDate(loan.endDate) },
            { label: 'الغرض', value: loan.purpose },
            { label: 'معتمد من', value: loan.approvedBy },
            { label: 'تاريخ الاعتماد', value: loan.approvedAt ? fmtDate(loan.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* جدول الأقساط */}
        {schedule.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>جدول السداد</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              <View style={[styles.lineHeader, { backgroundColor: c.surfaceAlt }]}>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 30, textAlign: 'center' }}>#</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>تاريخ الاستحقاق</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 90, textAlign: 'left' }}>المبلغ</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, width: 60, textAlign: 'center' }}>الحالة</Text>
              </View>
              {schedule.map((row, i) => {
                const isPaid = row.status === 'paid';
                return (
                  <View key={i} style={[styles.lineRow, { borderBottomColor: c.border }, i === schedule.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={{ fontSize: 12, color: c.textMuted, width: 30, textAlign: 'center' }}>{row.installmentNo ?? i + 1}</Text>
                    <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{fmtDate(row.dueDate)}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, width: 90, textAlign: 'left' }}>{fmtMoney(row.amount, currency)}</Text>
                    <View style={{ width: 60, alignItems: 'center' }}>
                      <View style={{ backgroundColor: isPaid ? '#22C55E20' : '#F59E0B20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: isPaid ? '#22C55E' : '#F59E0B', fontWeight: '600' }}>{isPaid ? 'مدفوع' : 'معلق'}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </GCard>
          </>
        )}

        {/* ملاحظات */}
        {loan.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{loan.notes}</Text>
          </GCard>
        ) : null}

        {/* إجراءات */}
        {isPending && (
          <View style={{ gap: 10 }}>
            <GButton title="اعتماد السلفة" onPress={() => doAction('approve', 'اعتماد السلفة')} loading={acting} />
            <GButton title="رفض السلفة" variant="secondary" onPress={() => doAction('reject', 'رفض السلفة')} loading={acting} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  progressBar: { padding: 12, borderBottomWidth: 1, gap: 4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  lineHeader: { flexDirection: 'row', padding: 8, gap: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 4, borderBottomWidth: 1 },
});
