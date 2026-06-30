import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LifecycleStatus { status?: string; stage?: string; startDate?: string; expectedEndDate?: string; notes?: string; }

export default function LifecycleStatus() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LifecycleStatus>('/api/employees/0/lifecycle/status');
  const d = (data && !Array.isArray(data)) ? data as LifecycleStatus : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string) => value ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13 }}>{value}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حالة دورة حياة الموظف' }} />
      {row('الحالة', d.status)}
      {row('المرحلة', d.stage)}
      {row('تاريخ البداية', d.startDate ? new Date(d.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {row('تاريخ الانتهاء المتوقع', d.expectedEndDate ? new Date(d.expectedEndDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {!!d.notes && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>ملاحظات</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.notes}</Text>
        </View>
      )}
    </ScrollView>
  );
}
