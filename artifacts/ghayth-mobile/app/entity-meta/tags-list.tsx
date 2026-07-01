import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Tag { id?: number; name?: string; color?: string; count?: number; }

export default function TagsList() {
  const c = useColors();
  const { entityType } = useLocalSearchParams<{ entityType: string }>();
  const { data, isLoading, isError, refetch } = useList<Tag[]>(`/api/entity-meta/tags-list/${entityType ?? 'all'}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قائمة التسميات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pricetag-outline" title="لا توجد تسميات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.count != null ? `${item.count} عنصر` : ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
