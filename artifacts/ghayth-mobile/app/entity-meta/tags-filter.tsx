import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TagFilter { name?: string; count?: number; }

export default function TagsFilter() {
  const c = useColors();
  const { entityType } = useLocalSearchParams<{ entityType: string }>();
  const { data, isLoading, isError, refetch } = useList<TagFilter[]>(`/api/entity-meta/tags-filter/${entityType ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فلتر العلامات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.name ?? String(i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetags-outline" title="لا توجد علامات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.count ?? 0}</Text>
          </View>
        )}
      />
    </View>
  );
}
