import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NotifTemplate {
  id?: number;
  name?: string;
  channel?: string;
  eventType?: string;
  isActive?: boolean;
}

export default function NotificationEngineTemplatesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NotifTemplate[]>('/api/notification-engine/templates');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قوالب الإشعارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قوالب محرك الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد قوالب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.channel ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.channel}</Text> : null}
              {item.eventType ? <Text style={{ fontSize: 11, color: c.textMuted }}>— {item.eventType}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
