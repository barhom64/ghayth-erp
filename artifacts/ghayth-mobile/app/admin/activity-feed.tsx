import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActivityEntry {
  id?: number;
  actor?: string;
  action?: string;
  target?: string;
  entityType?: string;
  createdAt?: string;
}

export default function AdminActivityFeedScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ActivityEntry[]>('/api/activity-log/feed');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تغذية النشاط…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تغذية نشاط النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا يوجد نشاط" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{item.actor ?? '—'}</Text>
              {item.entityType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.entityType}</Text> : null}
            </View>
            {item.action ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.action}</Text> : null}
            {item.target ? <Text style={{ fontSize: 12, color: c.text, marginTop: 2 }}>{item.target}</Text> : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
