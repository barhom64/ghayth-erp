import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Enrollment { id?: number; employeeName?: string; programName?: string; status?: string; enrolledAt?: string; completedAt?: string; score?: number; feedback?: string; }

export default function EnrollmentDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Enrollment>('/api/training/enrollments/0');
  const d = (data && !Array.isArray(data)) ? data as Enrollment : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined && value !== null ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13, flex: 1, textAlign: 'left' }}>{String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تفاصيل التسجيل' }} />
      {row('الموظف', d.employeeName)}
      {row('البرنامج', d.programName)}
      {row('الحالة', d.status)}
      {row('الدرجة', d.score)}
      {row('تاريخ التسجيل', d.enrolledAt ? new Date(d.enrolledAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {row('تاريخ الإكمال', d.completedAt ? new Date(d.completedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {!!d.feedback && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>التغذية الراجعة</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.feedback}</Text>
        </View>
      )}
    </ScrollView>
  );
}
