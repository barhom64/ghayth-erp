import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Application { id?: number; applicantName?: string; jobTitle?: string; status?: string; appliedAt?: string; phone?: string; email?: string; experience?: string; notes?: string; }

export default function ApplicationDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Application>('/api/recruitment/applications/0');
  const d = (data && !Array.isArray(data)) ? data as Application : null;
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
      <Stack.Screen options={{ title: d.applicantName ?? 'تفاصيل الطلب' }} />
      {row('اسم المتقدم', d.applicantName)}
      {row('الوظيفة المطلوبة', d.jobTitle)}
      {row('الحالة', d.status)}
      {row('الهاتف', d.phone)}
      {row('البريد الإلكتروني', d.email)}
      {row('الخبرة', d.experience)}
      {row('تاريخ التقديم', d.appliedAt ? new Date(d.appliedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {!!d.notes && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>ملاحظات</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.notes}</Text>
        </View>
      )}
    </ScrollView>
  );
}
