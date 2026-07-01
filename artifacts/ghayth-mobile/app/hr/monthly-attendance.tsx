import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MonthlyAttendance { employeeId?: number; employeeName?: string; month?: string; presentDays?: number; absentDays?: number; lateDays?: number; }

export default function MonthlyAttendanceReport() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MonthlyAttendance[]>('/api/hr/monthly-attendance');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الحضور…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير الحضور الشهري' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.employeeName ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              <Text style={{ color: '#22c55e', fontSize: 12 }}>حاضر: {item.presentDays ?? 0}</Text>
              <Text style={{ color: '#ef4444', fontSize: 12 }}>غائب: {item.absentDays ?? 0}</Text>
              <Text style={{ color: '#f59e0b', fontSize: 12 }}>متأخر: {item.lateDays ?? 0}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
