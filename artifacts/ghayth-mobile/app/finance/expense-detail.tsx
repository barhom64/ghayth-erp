/**
 * تفاصيل المصروف / طلب السداد
 * GET /api/finance/expenses/:id
 * POST /api/finance/expenses/:id/approve
 * POST /api/finance/expenses/:id/reject
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Expense {
  id: number;
  ref?: string;
  employeeName?: string;
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  date?: string;
  status?: string;
  projectName?: string;
  costCenter?: string;
  receiptUrl?: string;
  vatAmount?: number;
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  notes?: string;
  attachments?: { id: number; name?: string }[];
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

export default function ExpenseDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: expense, isLoading, refetch } = useList<Expense>(`/api/finance/expenses/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/finance/expenses/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل المصروف…" />;
  if (!expense) return <GEmptyState icon="receipt-outline" title="مصروف غير موجود" description="تعذّر العثور على بيانات المصروف" />;

  const ref = expense.ref ?? `#${expense.id}`;
  const st = statusBadge(expense.status ?? '');
  const isPending = expense.status === 'pending' || expense.status === 'submitted';
  const attachments = expense.attachments ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `مصروف ${ref}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{expense.employeeName ?? '—'}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{expense.category ?? '—'} · {fmtDate(expense.date)}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(expense.amount, expense.currency)}</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الفئة', value: expense.category },
            { label: 'المشروع', value: expense.projectName },
            { label: 'مركز التكلفة', value: expense.costCenter },
            { label: 'ضريبة القيمة المضافة', value: expense.vatAmount !== undefined ? fmtMoney(expense.vatAmount, expense.currency) : undefined },
            { label: 'الإجمالي', value: fmtMoney(expense.amount, expense.currency) },
            { label: 'معتمد من', value: expense.approvedBy },
            { label: 'تاريخ الاعتماد', value: expense.approvedAt ? fmtDate(expense.approvedAt) : undefined },
            { label: 'تاريخ الصرف', value: expense.paidAt ? fmtDate(expense.paidAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, fontWeight: row.label === 'الإجمالي' ? '700' : '400', color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {expense.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{expense.description}</Text>
          </GCard>
        ) : null}

        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المستندات والإيصالات</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Ionicons name="document-attach-outline" size={16} color={c.brand} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مستند ${att.id}`}</Text>
              </View>
            ))}
          </GCard>
        )}

        {expense.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{expense.notes}</Text>
          </GCard>
        ) : null}

        {isPending && (
          <View style={{ gap: 10 }}>
            <GButton title="اعتماد المصروف" onPress={() => doAction('approve', 'اعتماد المصروف')} loading={acting} />
            <GButton title="رفض المصروف" variant="secondary" onPress={() => doAction('reject', 'رفض المصروف')} loading={acting} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
