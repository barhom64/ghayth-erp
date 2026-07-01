import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Account { code: string; name: string; type?: string; level?: number; }

export default function ChartOfAccounts() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Account[]>('/api/finance/chart-of-accounts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل الدليل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دليل الحسابات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.code ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد حسابات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, paddingRight: 14 + (item.level ?? 0) * 12 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: item.level === 0 ? '700' : '400' }}>{item.code} — {item.name}</Text>
            {item.type ? <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.type}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
