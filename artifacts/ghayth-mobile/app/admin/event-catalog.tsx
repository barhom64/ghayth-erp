import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EventCatalogItem {
  eventType?: string;
  domain?: string;
  description?: string;
  subscriberCount?: number;
  lastFired?: string;
}

export default function EventCatalogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EventCatalogItem[]>('/api/admin/governance/event-catalog');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فهرس الأحداث…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فهرس الأحداث' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.eventType ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="flash-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.eventType ?? '—'}</Text>
              {item.subscriberCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.subscriberCount} مشترك</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.textMuted }}>النطاق: {item.domain}</Text> : null}
              {item.description ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.description}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
