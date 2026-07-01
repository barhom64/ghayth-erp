import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PrintArchiveItem { id?: number; fileName?: string; createdAt?: string; entityId?: number; }

export default function PrintArchive() {
  const c = useColors();
  const { entityType, entityId } = useLocalSearchParams<{ entityType: string; entityId: string }>();
  const { data, isLoading, isError, refetch } = useList<PrintArchiveItem[]>(`/api/print/archive/${entityType ?? 'entity'}/${entityId ?? '0'}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أرشيف الطباعة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="archive-outline" title="لا يوجد أرشيف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.fileName ?? String(item.id ?? '')}</Text>
            {!!item.createdAt && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
