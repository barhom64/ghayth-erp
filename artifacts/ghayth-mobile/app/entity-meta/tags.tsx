import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Tag { id?: number; name?: string; color?: string; }

export default function EntityTags() {
  const c = useColors();
  const { entityType, entityId } = useLocalSearchParams<{ entityType: string; entityId: string }>();
  const { data, isLoading, isError, refetch } = useList<Tag[]>(`/api/entity-meta/tags/${entityType ?? ''}/${entityId ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل العلامات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العلامات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد علامات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '—'}</Text>
          </View>
        )}
      />
    </View>
  );
}
