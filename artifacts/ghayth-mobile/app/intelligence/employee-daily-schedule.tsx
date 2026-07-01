import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduleItem { id?: number; title?: string; startsAt?: string; endsAt?: string; type?: string; }

export default function EmployeeDailySchedule() {
  const c = useColors();
  const { employeeId } = useLocalSearchParams<{ employeeId: string }>();
  const { data, isLoading, isError, refetch } = useList<ScheduleItem[]>(`/api/intelligence/daily-schedule/employee/${employeeId}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول الموظف اليومي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد مهام اليوم" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.title ?? String(item.id ?? '')}</Text>
            {item.startsAt && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{new Date(item.startsAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
