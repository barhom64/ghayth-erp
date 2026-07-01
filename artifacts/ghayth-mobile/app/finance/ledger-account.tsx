import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LedgerLine { id?: number; date?: string; description?: string; debit?: number; credit?: number; balance?: number; }

export default function LedgerAccountScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LedgerLine[]>('/api/finance/ledger/1000');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفتر الأستاذ' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="book-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.debit ? <Text style={{ color: '#e53e3e', fontSize: 12 }}>{item.debit.toLocaleString('ar-SA')}</Text> : null}
              {item.credit ? <Text style={{ color: '#38a169', fontSize: 12 }}>{item.credit.toLocaleString('ar-SA')}</Text> : null}
              {item.balance != null ? <Text style={{ color: c.brand, fontSize: 12 }}>{item.balance.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
