import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NotificationPreference {
  id?: number;
  channel?: string;
  eventType?: string;
  enabled?: boolean;
}

export default function NotificationEnginePreferencesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NotificationPreference[]>('/api/notification-engine/preferences');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تفضيلات الإشعارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفضيلات محرك الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد تفضيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.eventType ?? '—'}</Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.enabled ? '#22C55E' : '#9CA3AF' }} />
            </View>
            {item.channel ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.channel}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
