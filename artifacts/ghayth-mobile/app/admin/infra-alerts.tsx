import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InfraAlert {
  id?: number;
  name?: string;
  severity?: string;
  status?: string;
  message?: string;
  triggeredAt?: string;
}

export default function AdminInfraAlertsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InfraAlert[]>('/api/intelligence/alerts/infra');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تنبيهات البنية التحتية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const sevColor = (s?: string) => s === 'critical' ? '#EF4444' : s === 'warning' ? '#F59E0B' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات البنية التحتية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد تنبيهات نشطة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.name ?? '—'}</Text>
              {item.severity ? (
                <View style={{ backgroundColor: sevColor(item.severity), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>{item.severity}</Text>
                </View>
              ) : null}
            </View>
            {item.message ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.message}</Text> : null}
            {item.triggeredAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.triggeredAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
