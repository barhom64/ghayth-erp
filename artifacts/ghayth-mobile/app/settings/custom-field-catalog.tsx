import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CatalogItem { name?: string; label?: string; fieldType?: string; }

export default function CustomFieldCatalog() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CatalogItem[]>('/api/custom-fields/catalog');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كتالوج الحقول المخصصة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.name ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد حقول" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.label ?? item.name ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.fieldType ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
