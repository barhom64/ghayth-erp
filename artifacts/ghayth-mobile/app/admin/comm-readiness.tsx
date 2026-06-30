import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ReadinessItem {
  provider?: string;
  status?: string;
  latencyMs?: number;
  lastCheckedAt?: string;
  issue?: string;
}

export default function CommReadinessScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ReadinessItem[]>('/api/admin/communication-control/readiness');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ فحص جاهزية الاتصالات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جاهزية الاتصالات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.provider ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wifi-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.provider ?? '—'}</Text>
              {item.issue ? <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>{item.issue}</Text> : null}
              {item.latencyMs != null ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>التأخير: {item.latencyMs} مللي ث</Text> : null}
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.status === 'ok' ? '#22C55E' : '#EF4444' }} />
          </View>
        )}
      />
    </View>
  );
}
