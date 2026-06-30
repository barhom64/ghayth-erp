/**
 * قواعد الإشعارات
 * GET /api/admin/notification-routing/rules
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NotificationRule {
  id: number;
  eventType?: string;
  channelType?: string;
  recipientRole?: string;
  isActive?: boolean;
  priority?: number;
}

export default function NotificationRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NotificationRule[]>('/api/admin/notification-routing/rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد الإشعارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد قواعد إشعارات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.eventType ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.channelType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.channelType}</Text> : null}
              {item.recipientRole ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.recipientRole}</Text> : null}
              {item.priority != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>أولوية: {item.priority}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
