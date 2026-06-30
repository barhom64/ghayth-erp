import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsRun { id?: number; payrollRunId?: number; status?: string; submittedAt?: string; employeeCount?: number; totalAmount?: number; }

export default function WpsRunDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WpsRun>('/api/hr/wps/runs/0');
  const d = (data && !Array.isArray(data)) ? data as WpsRun : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `إرسال WPS ${d?.id ?? ''}` }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'الحالة', value: d?.status }, { label: 'تاريخ الإرسال', value: d?.submittedAt ? new Date(d.submittedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }, { label: 'عدد الموظفين', value: d?.employeeCount !== undefined ? String(d.employeeCount) : undefined }, { label: 'إجمالي المبلغ', value: d?.totalAmount?.toLocaleString('ar-SA') ? `${d.totalAmount.toLocaleString('ar-SA')} ر.س` : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
