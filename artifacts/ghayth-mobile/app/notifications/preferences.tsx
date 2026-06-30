import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NotifPreference {
  id?: number;
  channel?: string;
  eventType?: string;
  enabled?: boolean;
  label?: string;
}

export default function NotificationPreferencesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NotifPreference[]>('/api/notifications/preferences');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التفضيلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفضيلات الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد تفضيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.label ?? item.eventType ?? '—'}</Text>
              {item.channel ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.channel}</Text> : null}
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.enabled ? '#22C55E' : '#EF4444' }} />
          </View>
        )}
      />
    </View>
  );
}
