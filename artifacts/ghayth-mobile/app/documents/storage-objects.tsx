import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StorageObject { key?: string; name?: string; size?: number; contentType?: string; }

export default function StorageObjectsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<StorageObject[]>('/api/storage/objects/');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملفات التخزين' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-outline" title="لا توجد ملفات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 14, flex: 1 }}>{item.name ?? item.key ?? ''}</Text>
            {item.size != null && <Text style={{ color: c.textMuted, fontSize: 12 }}>{(item.size / 1024).toFixed(1)} ك</Text>}
          </View>
        )}
      />
    </View>
  );
}
