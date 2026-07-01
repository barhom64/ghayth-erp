import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Account { id?: number; code?: string; name?: string; type?: string; balance?: number; }

export default function AccountsListScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Account[]>('/api/finance/accounts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحسابات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد حسابات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.code}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.type ?? ''}</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 13, marginTop: 2 }}>{item.name ?? ''}</Text>
            {item.balance != null ? <Text style={{ color: c.brand, fontSize: 12, marginTop: 4 }}>{item.balance.toLocaleString('ar-SA')} ر.س</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
