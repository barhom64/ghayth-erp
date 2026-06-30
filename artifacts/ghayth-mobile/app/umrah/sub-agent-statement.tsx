/**
 * كشف حساب الوكيل الفرعي
 * GET /api/umrah/statements/:subAgentId
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface Statement {
  subAgentId?: number;
  subAgentName?: string;
  currency?: string;
  totalInvoiced?: number;
  totalPaid?: number;
  totalCommission?: number;
  balance?: number;
  transactions?: Array<{
    id: number;
    type?: string;
    amount?: number;
    date?: string;
    reference?: string;
    description?: string;
  }>;
}

function fmtMoney(val?: number, currency?: string): string {
  if (!val && val !== 0) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const TYPE_LABEL: Record<string, string> = {
  invoice: 'فاتورة',
  payment: 'دفعة',
  commission: 'عمولة',
  adjustment: 'تسوية',
  refund: 'استرداد',
};

export default function SubAgentStatementScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, isError } = useList<Statement>(`/api/umrah/statements/${id}`);
  const { refreshing, onRefresh } = useRefresh([[`/api/umrah/statements/${id}`]]);

  const stmt = Array.isArray(data) ? data[0] : data as Statement | null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف الحساب…" />;
  if (isError || !stmt) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const transactions = Array.isArray(stmt.transactions) ? stmt.transactions : [];
  const balanceColor = (stmt.balance ?? 0) >= 0 ? '#22C55E' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `كشف: ${stmt.subAgentName ?? `#${id}`}` }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 14 }}>
            {stmt.subAgentName ?? `وكيل #${id}`}
          </Text>
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' }}>
                {fmtMoney(stmt.totalInvoiced, stmt.currency)}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>إجمالي الفواتير</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E', textAlign: 'center' }}>
                {fmtMoney(stmt.totalPaid, stmt.currency)}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>المدفوع</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.brand, textAlign: 'center' }}>
                {fmtMoney(stmt.totalCommission, stmt.currency)}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>العمولات</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: balanceColor + '15', borderWidth: 1, borderColor: balanceColor }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: balanceColor, textAlign: 'center' }}>
                {fmtMoney(stmt.balance, stmt.currency)}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>الرصيد</Text>
            </View>
          </View>
        </GCard>

        {transactions.length > 0 && (
          <GCard style={{ gap: 0, padding: 0 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>حركات الحساب</Text>
            </View>
            {transactions.map((tx: { id: number; type?: string; amount?: number; date?: string; reference?: string; description?: string }, i: number) => (
              <View
                key={tx.id}
                style={[styles.txRow, { borderBottomColor: c.border, borderBottomWidth: i === transactions.length - 1 ? 0 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>
                    {TYPE_LABEL[tx.type ?? ''] ?? tx.type ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    {tx.description ?? tx.reference ?? ''} · {fmtDate(tx.date)}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: (tx.amount ?? 0) >= 0 ? '#22C55E' : '#EF4444' }}>
                  {fmtMoney(tx.amount, stmt.currency)}
                </Text>
              </View>
            ))}
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: '40%', borderRadius: 10, padding: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
});
