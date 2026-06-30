import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeOfMonth { employeeId?: number; employeeName?: string; month?: string; reason?: string; }

export default function EmployeeOfMonth() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeOfMonth>('/api/public/employee-of-month');
  const d = (data && !Array.isArray(data)) ? data as EmployeeOfMonth : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'موظف الشهر' }} />
      <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 24, alignItems: 'center', width: '100%' }}>
          <Text style={{ color: c.brand, fontSize: 40 }}>🏆</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', marginTop: 12 }}>{d?.employeeName ?? '—'}</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 4 }}>{d?.month ?? ''}</Text>
          {d?.reason && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 12, textAlign: 'center' }}>{d.reason}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
