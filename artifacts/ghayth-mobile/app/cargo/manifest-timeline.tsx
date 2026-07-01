import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ManifestTimelineEvent { id?: number; event?: string; location?: string; timestamp?: string; status?: string; }

export default function ManifestTimeline() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<ManifestTimelineEvent[]>(`/api/cargo/manifests/${id ?? '0'}/timeline`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مسار الشحنة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="map-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.event ?? ''}</Text>
            {!!item.location && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.location}</Text>}
            {!!item.timestamp && <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(item.timestamp).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            {!!item.status && <Text style={{ color: c.brand, fontSize: 12, marginTop: 2 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
