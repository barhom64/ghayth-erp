import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecentEvent { id?: number; type?: string; description?: string; timestamp?: string; }

export default function DashboardRecentEvents() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RecentEvent[]>('/api/dashboard/charts/recent-events');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل الأحداث…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأحداث الأخيرة' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.type ?? ''} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
