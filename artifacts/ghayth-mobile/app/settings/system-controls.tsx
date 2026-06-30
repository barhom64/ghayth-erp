import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemControl {
  key?: string;
  label?: string;
  value?: boolean | string | number;
  category?: string;
}

export default function SystemControlsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SystemControl[]>('/api/settings/system-controls');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ضوابط النظام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ضوابط النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="toggle-outline" title="لا توجد ضوابط" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.label ?? item.key ?? '—'}</Text>
              {item.category ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.category}</Text> : null}
            </View>
            {typeof item.value === 'boolean' ? (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.value ? '#22C55E' : '#EF4444' }} />
            ) : (
              <Text style={{ fontSize: 13, color: c.brand }}>{String(item.value ?? '—')}</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
