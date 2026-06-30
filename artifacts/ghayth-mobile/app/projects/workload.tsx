import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WorkloadItem {
  employeeId?: number;
  employeeName?: string;
  activeTasks?: number;
  completedTasks?: number;
  overdueTask?: number;
  utilization?: number;
}

export default function WorkloadScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WorkloadItem[]>('/api/projects/manager/workload');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل عبء العمل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عبء العمل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const util = item.utilization ?? 0;
          const utilColor = util >= 90 ? '#EF4444' : util >= 70 ? '#F59E0B' : '#22C55E';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: utilColor }}>{util}%</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <Text style={{ fontSize: 12, color: c.brand }}>{item.activeTasks ?? 0} نشطة</Text>
                <Text style={{ fontSize: 12, color: '#22C55E' }}>{item.completedTasks ?? 0} مكتملة</Text>
                {(item.overdueTask ?? 0) > 0 ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.overdueTask} متأخرة</Text> : null}
              </View>
              <View style={{ marginTop: 6, height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(util, 100)}%` as never, height: 4, backgroundColor: utilColor, borderRadius: 2 }} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
