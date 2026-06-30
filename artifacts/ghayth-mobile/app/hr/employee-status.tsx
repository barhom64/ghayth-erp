import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeStatus { employeeId?: number; status?: string; lastCheckin?: string; currentShift?: string; leaveBalance?: number; openRequests?: number; }

export default function EmployeeStatusScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeStatus>('/api/hr/employee-status/0');
  const d = (data && !Array.isArray(data)) ? data as EmployeeStatus : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الحالة', d.status ?? '-'],
    ['آخر تسجيل حضور', d.lastCheckin ? new Date(d.lastCheckin).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['الوردية الحالية', d.currentShift ?? '-'],
    ['رصيد الإجازات', String(d.leaveBalance ?? 0)],
    ['الطلبات المفتوحة', String(d.openRequests ?? 0)],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حالة الموظف' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
