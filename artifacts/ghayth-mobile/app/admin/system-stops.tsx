import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemStop {
  id?: number | string;
  feature?: string;
  reason?: string;
  blockedBy?: string;
  severity?: string;
  reportedAt?: string;
  resolvedAt?: string | null;
}

export default function SystemStopsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SystemStop[]>('/api/admin/system-stops');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إيقافات النظام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إيقافات النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-circle-outline" title="لا توجد إيقافات" description="النظام يعمل بشكل طبيعي" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, borderRightWidth: 3, borderRightColor: item.resolvedAt ? '#22C55E' : '#EF4444' }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.feature ?? '—'}</Text>
              <GStatusBadge status={item.resolvedAt ? 'active' : 'suspended'} />
            </View>
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 2 }}>{item.reason}</Text> : null}
            {item.blockedBy ? <Text style={{ fontSize: 11, color: '#EF4444' }}>بواسطة: {item.blockedBy}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
