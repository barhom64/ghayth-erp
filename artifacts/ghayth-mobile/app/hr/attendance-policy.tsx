import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendancePolicy {
  lateThresholdMinutes?: number;
  earlyLeaveThresholdMinutes?: number;
  graceMinutes?: number;
  workHoursPerDay?: number;
  overtimeMultiplier?: number;
  requireGeofence?: boolean;
  requireFaceId?: boolean;
  [key: string]: unknown;
}

export default function AttendancePolicyScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AttendancePolicy>('/api/hr/attendance-policy');
  const d = (data && !Array.isArray(data)) ? data as AttendancePolicy : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسة الحضور…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rows = [
    { label: 'حد التأخر (دقائق)', value: d?.lateThresholdMinutes ?? '—' },
    { label: 'حد الانصراف المبكر', value: d?.earlyLeaveThresholdMinutes ?? '—' },
    { label: 'فترة السماح (دقائق)', value: d?.graceMinutes ?? '—' },
    { label: 'ساعات العمل / يوم', value: d?.workHoursPerDay ?? '—' },
    { label: 'مضاعف الإضافي', value: d?.overtimeMultiplier ?? '—' },
    { label: 'يتطلب نطاق جغرافي', value: d?.requireGeofence ? 'نعم' : 'لا' },
    { label: 'يتطلب التعرف على الوجه', value: d?.requireFaceId ? 'نعم' : 'لا' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسة الحضور' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          {rows.map((row, i) => (
            <View key={row.label}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: c.border }} /> : null}
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10 }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{String(row.value)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
