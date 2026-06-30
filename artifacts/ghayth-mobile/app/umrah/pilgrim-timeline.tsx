import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TimelineEvent {
  id?: number;
  event?: string;
  date?: string;
  actor?: string;
  notes?: string;
}

export default function PilgrimTimelineScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TimelineEvent[]>('/api/umrah/pilgrims/0/timeline');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الجدول الزمني…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول المعتمر الزمني' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1, padding: 16 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row-reverse', marginBottom: 16 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand, marginTop: 4, marginLeft: 12 }} />
            <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 8, padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{item.event ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>
                {item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                {item.actor ? ` — ${item.actor}` : ''}
              </Text>
              {item.notes ? (
                <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.notes}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
