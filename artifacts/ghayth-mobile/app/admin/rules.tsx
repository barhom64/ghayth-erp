import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemRule {
  id?: number;
  name?: string;
  domain?: string;
  type?: string;
  isActive?: boolean;
  description?: string;
}

export default function AdminRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SystemRule[]>('/api/rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد النظام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="options-outline" title="لا توجد قواعد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF', marginTop: 3 }} />
            </View>
            {item.domain ? <Text style={{ fontSize: 12, color: c.brand }}>{item.domain}</Text> : null}
            {item.type ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.type}</Text> : null}
            {item.description ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.description}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
