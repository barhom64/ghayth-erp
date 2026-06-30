import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HealthCheck {
  id?: number;
  name?: string;
  status?: string;
  message?: string;
  lastChecked?: string;
  durationMs?: number;
}

export default function SystemHealthChecksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<HealthCheck[]>('/api/admin/system-health-checks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل فحوصات الصحة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فحوصات صحة النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا توجد فحوصات" description="" />}
        renderItem={({ item }) => {
          const statusColor = item.status === 'ok' ? '#22C55E' : item.status === 'warn' ? '#F59E0B' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
                {item.message ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.message}</Text> : null}
                {item.durationMs != null ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.durationMs} ms</Text> : null}
              </View>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
            </View>
          );
        }}
      />
    </View>
  );
}
