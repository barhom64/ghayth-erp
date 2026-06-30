import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LedgerLine {
  journalId?: number;
  date?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  accountName?: string;
}

export default function SubsidiaryLedgerScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LedgerLine[]>('/api/finance/subsidiary-ledger/client/0');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دفتر الأستاذ المساعد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفتر الأستاذ المساعد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.journalId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="book-outline" title="لا توجد حركات" description="" />}
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
          </View>
        )}
      />
    </View>
  );
}
