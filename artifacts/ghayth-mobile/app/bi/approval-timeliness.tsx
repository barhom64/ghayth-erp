import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApprovalTimeliness {
  entityType?: string;
  avgHours?: number;
  slaHours?: number;
  onTimeRate?: number;
  count?: number;
}

export default function BiApprovalTimelinessScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApprovalTimeliness[]>('/api/bi/operations/approval-timeliness');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل توقيت الاعتمادات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'توقيت الاعتمادات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.entityType ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.entityType ?? '—'}</Text>
              {item.onTimeRate != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: item.onTimeRate >= 0.9 ? '#22C55E' : '#EF4444' }}>
                  {(item.onTimeRate * 100).toFixed(0)}%
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16, marginTop: 4 }}>
              {item.avgHours != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>متوسط: {item.avgHours.toFixed(1)} ساعة</Text> : null}
              {item.slaHours != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>SLA: {item.slaHours} ساعة</Text> : null}
              {item.count != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.count} حالة</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
