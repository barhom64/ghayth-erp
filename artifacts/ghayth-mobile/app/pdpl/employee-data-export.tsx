import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExportData { employeeId?: number; employeeName?: string; generatedAt?: string; fields?: string[]; }

export default function EmployeeDataExport() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExportData>('/api/pdpl/employee-data-export/0');
  const d = (data && !Array.isArray(data)) ? data as ExportData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تصدير بيانات الموظف' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>{d?.employeeName ?? '—'}</Text>
        {d?.generatedAt && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 16 }}>تاريخ التصدير: {new Date(d.generatedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
        {(d?.fields ?? []).map((f, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 6 }}>
            <Text style={{ color: c.text, fontSize: 13 }}>{f}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
