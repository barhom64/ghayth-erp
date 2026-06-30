/**
 * قائمة الدخل
 * GET /api/finance/reports/income-statement
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IncomeStatementLine {
  id: number;
  accountCode?: string;
  accountName?: string;
  accountType?: string;
  amount?: number;
  currency?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  revenue: '#22C55E',
  expense: '#EF4444',
  subtotal: '#3B82F6',
  total: '#8B5CF6',
};

export default function IncomeStatementScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IncomeStatementLine[]>('/api/finance/reports/income-statement');
  const list = Array.isArray(data) ? data : [];

  const totalRevenue = list.filter(r => r.accountType === 'revenue').reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalExpense = list.filter(r => r.accountType === 'expense').reduce((s, r) => s + (r.amount ?? 0), 0);
  const netIncome = totalRevenue - totalExpense;

  if (isLoading) return <GLoadingState text="جارٍ تحميل قائمة الدخل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قائمة الدخل' }} />
      {list.length > 0 ? (
        <View style={{ backgroundColor: netIncome >= 0 ? '#22C55E20' : '#EF444420', padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي الإيرادات</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>{totalRevenue.toLocaleString('ar-SA')}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: netIncome >= 0 ? '#22C55E' : '#EF4444' }}>
            {netIncome >= 0 ? 'ربح' : 'خسارة'}: {Math.abs(netIncome).toLocaleString('ar-SA')}
          </Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي المصروفات</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>{totalExpense.toLocaleString('ar-SA')}</Text>
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
          const isBold = item.isSubtotal || item.isTotal;
          return (
            <View style={{
              backgroundColor: c.surface,
              borderBottomWidth: 1, borderBottomColor: c.border, padding: 12,
              flexDirection: 'row-reverse', justifyContent: 'space-between'
            }}>
              <Text style={{ fontSize: 13, fontWeight: isBold ? '700' : '400', color: isBold ? typeColor : c.text, flex: 1, textAlign: 'right' }}>
                {item.accountCode ? `${item.accountCode} ` : ''}{item.accountName ?? '—'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: isBold ? '700' : '600', color: typeColor }}>
                {item.amount != null ? item.amount.toLocaleString('ar-SA') : '—'}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}
