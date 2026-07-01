import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StatementItem { id?: number; date?: string; description?: string; debit?: number; credit?: number; balance?: number; }

export default function CustomerStatementScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<StatementItem[]>('/api/finance/reports/customer-statement/1');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف حساب العميل' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.debit ? <Text style={{ color: '#e53e3e', fontSize: 12 }}>مدين: {item.debit.toLocaleString('ar-SA')} ر.س</Text> : null}
              {item.credit ? <Text style={{ color: '#38a169', fontSize: 12 }}>دائن: {item.credit.toLocaleString('ar-SA')} ر.س</Text> : null}
              {item.balance != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>الرصيد: {item.balance.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
