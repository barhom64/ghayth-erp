import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StatementEntry { id?: number; date?: string; description?: string; debit?: number; credit?: number; balance?: number; }

export default function VendorStatement() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<StatementEntry[]>('/api/finance/reports/vendor-statement/0');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف حساب المورد' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{item.description ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : ''}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: '#22c55e', fontSize: 12 }}>{item.debit ? `${item.debit.toLocaleString('ar-SA')} مدين` : ''}</Text>
              <Text style={{ color: '#ef4444', fontSize: 12 }}>{item.credit ? `${item.credit.toLocaleString('ar-SA')} دائن` : ''}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>رصيد: {item.balance?.toLocaleString('ar-SA') ?? '—'}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
