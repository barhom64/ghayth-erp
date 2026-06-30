import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EventJourney {
  id?: number | string;
  journeyType?: string;
  entityId?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  stepsCount?: number;
}

export default function AdminEventJourneysScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EventJourney[]>('/api/events/journeys');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل رحلات الأحداث…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'رحلات الأحداث' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد رحلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.journeyType ?? '—'}</Text>
              {item.status ? <GStatusBadge status={item.status} /> : null}
            </View>
            {item.stepsCount != null ? (
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.stepsCount} خطوات</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
