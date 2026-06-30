/**
 * الميزانية العمومية
 * GET /api/finance/reports/balance-sheet
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BalanceSheetLine {
  id: number;
  accountCode?: string;
  accountName?: string;
  accountType?: string;
  balance?: number;
  currency?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  asset: '#3B82F6',
  liability: '#EF4444',
  equity: '#8B5CF6',
};

export default function BalanceSheetScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BalanceSheetLine[]>('/api/finance/reports/balance-sheet');
  const list = Array.isArray(data) ? data : [];

  const totalAssets = list.filter(r => r.accountType === 'asset').reduce((s, r) => s + (r.balance ?? 0), 0);
  const totalLiabEquity = list.filter(r => r.accountType === 'liability' || r.accountType === 'equity').reduce((s, r) => s + (r.balance ?? 0), 0);
  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الميزانية العمومية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الميزانية العمومية' }} />
      {list.length > 0 ? (
        <View style={{ backgroundColor: isBalanced ? '#22C55E20' : '#EF444420', padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي الأصول</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#3B82F6' }}>{totalAssets.toLocaleString('ar-SA')}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isBalanced ? '#22C55E' : '#EF4444' }}>
            {isBalanced ? '✓ متوازنة' : '✗ غير متوازنة'}
          </Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>الخصوم وحقوق الملكية</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' }}>{totalLiabEquity.toLocaleString('ar-SA')}</Text>
          </View>
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const typeColor = TYPE_COLOR[item.accountType ?? ''] ?? '#94A3B8';
          const isBold = item.isSubtotal || item.isTotal;
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: isBold ? '700' : '400', color: isBold ? typeColor : c.text, flex: 1, textAlign: 'right' }}>
                {item.accountCode ? `${item.accountCode} ` : ''}{item.accountName ?? '—'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: isBold ? '700' : '600', color: typeColor }}>
                {item.balance != null ? item.balance.toLocaleString('ar-SA') : '—'}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}
