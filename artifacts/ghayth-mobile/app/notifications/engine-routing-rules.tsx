import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoutingRule {
  id?: number;
  eventType?: string;
  channel?: string;
  priority?: number;
  condition?: string;
  enabled?: boolean;
}

export default function NotificationRoutingRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoutingRule[]>('/api/notification-engine/routing-rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد التوجيه…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد توجيه الإشعارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد قواعد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.eventType ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}>
                {item.priority != null ? (
                  <Text style={{ fontSize: 11, color: c.textMuted }}>P{item.priority}</Text>
                ) : null}
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.enabled ? '#22C55E' : '#9CA3AF' }} />
              </View>
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
