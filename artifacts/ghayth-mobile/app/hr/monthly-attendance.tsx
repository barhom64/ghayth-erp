import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MonthlyAttendance {
  employeeId?: number;
  employeeName?: string;
  period?: string;
  presentDays?: number;
  absentDays?: number;
  lateDays?: number;
  overtimeHours?: number;
}

export default function MonthlyAttendanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MonthlyAttendance[]>('/api/monthly-attendance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحضور الشهري…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحضور الشهري' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد بيانات حضور شهري" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              {item.presentDays != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>حضور: {item.presentDays}</Text> : null}
              {item.absentDays != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>غياب: {item.absentDays}</Text> : null}
              {item.lateDays != null ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>تأخر: {item.lateDays}</Text> : null}
              {item.overtimeHours != null ? <Text style={{ fontSize: 11, color: c.brand }}>إضافي: {item.overtimeHours}س</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
