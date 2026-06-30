import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Webhook {
  id?: number;
  url?: string;
  event?: string;
  isActive?: boolean;
  lastTriggered?: string;
}

export default function AdminNotificationWebhooksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Webhook[]>('/api/notification-engine/webhooks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الـ Webhooks…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Webhooks الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="link-outline" title="لا توجد webhooks" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }} numberOfLines={1}>{item.url ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF', marginTop: 3 }} />
            </View>
            {item.event ? <Text style={{ fontSize: 12, color: c.brand }}>{item.event}</Text> : null}
            {item.lastTriggered ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                آخر تشغيل: {new Date(item.lastTriggered).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
