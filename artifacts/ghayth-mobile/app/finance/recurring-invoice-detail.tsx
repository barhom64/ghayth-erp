/**
 * تفاصيل الفاتورة المتكررة
 * GET /api/finance/recurring-invoices/:id
 */
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface RecurringInvoice {
  id: number;
  ref?: string;
  clientName?: string;
  frequency?: string;
  amount?: number;
  currency?: string;
  nextDueDate?: string;
  lastGeneratedAt?: string;
  status?: string;
  description?: string;
  itemCount?: number;
}

const FREQ_LABEL: Record<string, string> = {
  monthly: 'شهرية', quarterly: 'ربع سنوية', biannual: 'نصف سنوية', annual: 'سنوية', weekly: 'أسبوعية',
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

export default function RecurringInvoiceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: inv, isLoading, refetch } = useList<RecurringInvoice>(`/api/finance/recurring-invoices/${id}`);
  const [acting, setActing] = React.useState(false);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد', onPress: async () => {
          setActing(true);
          try {
            await apiFetch(`/api/finance/recurring-invoices/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
            await refetch();
          } catch {
            Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
          } finally {
            setActing(false);
          }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفاتورة المتكررة…" />;
  if (!inv) return <GEmptyState icon="repeat-outline" title="غير موجودة" description="لم يُعثر على الفاتورة المتكررة" />;

  const st = statusBadge(inv.status ?? '');
  const isActive = inv.status === 'active';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `فاتورة متكررة ${inv.ref ?? `#${inv.id}`}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{inv.clientName ?? '—'}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>
            {FREQ_LABEL[inv.frequency ?? ''] ?? inv.frequency ?? '—'}
          </Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(inv.amount, inv.currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>لكل دورة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المرجع', value: inv.ref },
            { label: 'الاستحقاق القادم', value: fmtDate(inv.nextDueDate) },
            { label: 'آخر إنشاء', value: fmtDate(inv.lastGeneratedAt) },
            { label: 'الوصف', value: inv.description },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {isActive && (
          <GButton title="إنشاء فاتورة الآن" onPress={() => doAction('generate', 'إنشاء فاتورة')} loading={acting} />
        )}
        {isActive && (
          <GButton title="إيقاف الفاتورة المتكررة" variant="secondary" onPress={() => doAction('pause', 'إيقاف الفاتورة')} loading={acting} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
