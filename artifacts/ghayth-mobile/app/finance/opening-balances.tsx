import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OpeningBalance {
  accountCode?: string;
  accountName?: string;
  debit?: number;
  credit?: number;
  period?: string;
}

export default function OpeningBalancesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OpeningBalance[]>('/api/finance/opening-balances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأرصدة الافتتاحية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأرصدة الافتتاحية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.accountCode ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد أرصدة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{item.accountCode ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.debit != null ? <Text style={{ fontSize: 12, color: '#EF4444' }}>د: {Number(item.debit).toLocaleString('ar-SA')}</Text> : null}
                {item.credit != null ? <Text style={{ fontSize: 12, color: '#22C55E' }}>ك: {Number(item.credit).toLocaleString('ar-SA')}</Text> : null}
              </View>
            </View>
            {item.accountName ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.accountName}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
