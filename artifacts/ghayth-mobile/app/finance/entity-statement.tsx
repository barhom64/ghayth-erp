import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StatementLine {
  date?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  reference?: string;
}

export default function EntityStatementScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<StatementLine[]>('/api/finance/reports/entity-statement');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف الحساب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف حساب الكيان' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: c.text, flex: 1 }} numberOfLines={1}>{item.description ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#22C55E' }}>مدين: {Number(item.debit ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: '#EF4444' }}>دائن: {Number(item.credit ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: c.brand, fontWeight: '600' }}>رصيد: {Number(item.balance ?? 0).toLocaleString('ar-SA')}</Text>
            </View>
            {item.reference ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.reference}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
