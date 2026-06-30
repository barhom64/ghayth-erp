import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CashBankEntry {
  id?: number;
  date?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  bankAccount?: string;
}

export default function FinanceCashBankStatementScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CashBankEntry[]>('/api/finance/reports/cash-bank-statement');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف النقد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف النقد والبنك' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: c.text, flex: 1 }} numberOfLines={1}>{item.description ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: (item.balance ?? 0) >= 0 ? '#22C55E' : '#EF4444' }}>
                {(item.balance ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.debit ? <Text style={{ fontSize: 11, color: '#EF4444' }}>مدين: {item.debit.toLocaleString('ar-SA')}</Text> : null}
              {item.credit ? <Text style={{ fontSize: 11, color: '#22C55E' }}>دائن: {item.credit.toLocaleString('ar-SA')}</Text> : null}
            </View>
            {item.date ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>
                {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
