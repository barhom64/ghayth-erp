/**
 * التسوية البنكية
 * GET /api/finance/bank-reconciliations
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BankReconciliation {
  id: number;
  period?: string;
  bankAccount?: string;
  bankBalance?: number;
  bookBalance?: number;
  difference?: number;
  currency?: string;
  status?: string;
  reconciledBy?: string;
  reconciledAt?: string;
  unreconciledCount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' }); }
  catch { return val; }
}

export default function BankReconciliationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BankReconciliation[]>('/api/finance/bank-reconciliations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التسويات البنكية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التسوية البنكية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد تسويات بنكية" description="" />}
        renderItem={({ item }) => {
          const diff = item.difference ?? 0;
          const isBalanced = Math.abs(diff) < 0.01;
          return (
            <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: isBalanced ? '#22C55E' : '#F59E0B' }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                  {item.bankAccount ?? '—'} — {item.period ? fmtDate(item.period) : '—'}
                </Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>رصيد البنك</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                    {(item.bankBalance ?? 0).toLocaleString('ar-SA')}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الفرق</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isBalanced ? '#22C55E' : '#EF4444' }}>
                    {diff.toLocaleString('ar-SA')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>رصيد الدفتر</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                    {(item.bookBalance ?? 0).toLocaleString('ar-SA')}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.unreconciledCount != null ? (
                  <Text style={{ fontSize: 12, color: item.unreconciledCount > 0 ? '#F59E0B' : '#22C55E' }}>
                    {item.unreconciledCount} بند غير مسوًّى
                  </Text>
                ) : null}
                {item.reconciledBy ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.reconciledBy}</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
