/**
 * الورديات والجداول
 * GET /api/hr/attendance/shifts
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendanceShift {
  id: number;
  name?: string;
  code?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  workHours?: number;
  flexibleMinutes?: number;
  type?: string;
  isActive?: boolean;
  employeeCount?: number;
}

export default function AttendanceShiftsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AttendanceShift[]>('/api/hr/attendance/shifts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الورديات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الورديات والجداول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد ورديات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.code ? <Text style={{ fontSize: 11, color: c.brand, fontWeight: '700' }}>{item.code}</Text> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              {item.startTime ? <Text style={{ fontSize: 13, color: c.text }}>{item.startTime}</Text> : null}
              <Text style={{ color: c.textMuted }}>—</Text>
              {item.endTime ? <Text style={{ fontSize: 13, color: c.text }}>{item.endTime}</Text> : null}
              {item.workHours != null ? (
                <Text style={{ fontSize: 12, color: c.brand }}>{item.workHours} ساعة</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.breakMinutes != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>استراحة: {item.breakMinutes} دقيقة</Text> : null}
              {item.flexibleMinutes != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>مرونة: ±{item.flexibleMinutes} دقيقة</Text> : null}
              {item.employeeCount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.employeeCount} موظف</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
