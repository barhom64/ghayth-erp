import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MissingItem {
  id?: number;
  type?: string;
  name?: string;
  domain?: string;
  description?: string;
}

export default function SystemRegistryMissingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MissingItem[]>('/api/admin/system-registry/missing');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العناصر الناقصة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عناصر سجل النظام الناقصة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد عناصر ناقصة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444' }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type ?? ''}</Text>
            </View>
            {item.domain ? <Text style={{ fontSize: 12, color: c.brand }}>{item.domain}</Text> : null}
            {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.description}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
