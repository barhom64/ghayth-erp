import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RegistryNotification {
  id?: number;
  event?: string;
  channel?: string;
  domain?: string;
  template?: string;
  isActive?: boolean;
}

export default function SystemRegistryNotificationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RegistryNotification[]>('/api/admin/system-registry/notifications');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إشعارات السجل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إشعارات سجل النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد إشعارات مسجلة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.event ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF', marginTop: 3 }} />
            </View>
            {item.channel ? <Text style={{ fontSize: 12, color: c.brand }}>{item.channel}</Text> : null}
            {item.domain ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.domain}</Text> : null}
            {item.template ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.template}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
