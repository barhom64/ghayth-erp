import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RuleLog { id?: number; ruleName?: string; triggered?: boolean; result?: string; createdAt?: string; }

export default function RulesLog() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RuleLog[]>('/api/rules/log');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل القواعد' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="clipboard-outline" title="لا يوجد سجل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.ruleName ?? '—'}</Text>
            <Text style={{ color: item.triggered ? '#22c55e' : c.textMuted, fontSize: 12 }}>{item.triggered ? 'مُطلَق' : 'غير مُطلَق'}</Text>
          </View>
        )}
      />
    </View>
  );
}
