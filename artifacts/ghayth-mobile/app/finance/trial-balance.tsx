/**
 * ميزان المراجعة
 * GET /api/finance/reports/trial-balance
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrialBalanceLine {
  id: number;
  accountCode?: string;
  accountName?: string;
  accountType?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  currency?: string;
}

const TYPE_COLOR: Record<string, string> = {
  asset: '#3B82F6',
  liability: '#EF4444',
  equity: '#8B5CF6',
  revenue: '#22C55E',
  expense: '#F59E0B',
};

export default function TrialBalanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrialBalanceLine[]>('/api/finance/reports/trial-balance');
  const list = Array.isArray(data) ? data : [];

  const totalDebit = list.reduce((s, r) => s + (r.debit ?? 0), 0);
  const totalCredit = list.reduce((s, r) => s + (r.credit ?? 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ميزان المراجعة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ميزان المراجعة' }} />
      {list.length > 0 ? (
        <View style={{ backgroundColor: isBalanced ? '#22C55E20' : '#EF444420', padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي مدين</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{totalDebit.toLocaleString('ar-SA')}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isBalanced ? '#22C55E' : '#EF4444' }}>
            {isBalanced ? '✓ متوازن' : '✗ غير متوازن'}
          </Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي دائن</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{totalCredit.toLocaleString('ar-SA')}</Text>
          </View>
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const typeColor = TYPE_COLOR[item.accountType ?? ''] ?? '#94A3B8';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 12, flexDirection: 'row-reverse' }}>
              <View style={{ flex: 1.5 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{item.accountCode ?? ''} {item.accountName ?? '—'}</Text>
                {item.accountType ? <Text style={{ fontSize: 11, color: typeColor, textAlign: 'right' }}>{item.accountType}</Text> : null}
              </View>
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: c.textMuted }}>مدين</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                  {item.debit ? item.debit.toLocaleString('ar-SA') : '—'}
                </Text>
              </View>
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: c.textMuted }}>دائن</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                  {item.credit ? item.credit.toLocaleString('ar-SA') : '—'}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
