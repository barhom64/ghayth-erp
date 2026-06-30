import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BreakdownPhoto { id?: number; url?: string; caption?: string; }

export default function BreakdownPhotos() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BreakdownPhoto[]>('/api/fleet/breakdowns/0/photos');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صور العطل' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, padding: 8, flexGrow: 1 }}
        numColumns={2}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="image-outline" title="لا توجد صور" description="" />}
        renderItem={({ item }) => (
          <View style={{ flex: 1, margin: 4, backgroundColor: c.surface, borderRadius: 8, padding: 12 }}>
            <Text style={{ color: c.text, fontSize: 12 }}>{item.caption ?? 'صورة'}</Text>
          </View>
        )}
      />
    </View>
  );
}
