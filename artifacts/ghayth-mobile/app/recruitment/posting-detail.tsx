import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JobPosting { id?: number; title?: string; department?: string; status?: string; description?: string; requirements?: string; location?: string; salaryRange?: string; applicantsCount?: number; createdAt?: string; }

export default function PostingDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JobPosting>('/api/recruitment/postings/0');
  const d = (data && !Array.isArray(data)) ? data as JobPosting : null;
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
      <Stack.Screen options={{ title: d.title ?? 'تفاصيل الوظيفة' }} />
      {row('الوظيفة', d.title)}
      {row('القسم', d.department)}
      {row('الموقع', d.location)}
      {row('الراتب', d.salaryRange)}
      {row('الحالة', d.status)}
      {row('عدد المتقدمين', d.applicantsCount)}
      {row('تاريخ الإنشاء', d.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {!!d.description && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الوصف</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.description}</Text>
        </View>
      )}
      {!!d.requirements && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>المتطلبات</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.requirements}</Text>
        </View>
      )}
    </ScrollView>
  );
}
