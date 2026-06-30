import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AvgCompletionTime {
  entityType?: string;
  avgDays?: number;
  targetDays?: number;
  count?: number;
}

export default function BiAvgCompletionTimeScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AvgCompletionTime[]>('/api/bi/operations/avg-completion-time');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل متوسط وقت الإنجاز…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'متوسط وقت الإنجاز' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.entityType ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="hourglass-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.entityType ?? '—'}</Text>
              {item.count != null ? <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{item.count} حالة</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.avgDays != null ? (
                <Text style={{ fontSize: 16, fontWeight: '700', color: item.targetDays != null && item.avgDays <= item.targetDays ? '#22C55E' : '#EF4444' }}>
                  {item.avgDays.toFixed(1)} يوم
                </Text>
              ) : null}
              {item.targetDays != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الهدف: {item.targetDays}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
