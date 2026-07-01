import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduleItem { id?: number; title?: string; startTime?: string; endTime?: string; type?: string; }

export default function EmployeeDailyScheduleScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduleItem[]>('/api/intelligence/daily-schedule/employee/1');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول الموظف اليومي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا يوجد جدول" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.title ?? ''}</Text>
            {!!item.type && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.type}</Text>}
            {(!!item.startTime || !!item.endTime) && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.startTime ?? ''} — {item.endTime ?? ''}</Text>}
          </View>
        )}
      />
    </View>
  );
}
