import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingProgram { id?: number; name?: string; category?: string; status?: string; duration?: number; enrolledCount?: number; description?: string; instructor?: string; startDate?: string; endDate?: string; }

export default function TrainingProgramDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingProgram>('/api/training/programs/0');
  const d = (data && !Array.isArray(data)) ? data as TrainingProgram : null;
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
      <Stack.Screen options={{ title: d.name ?? 'تفاصيل البرنامج' }} />
      {row('اسم البرنامج', d.name)}
      {row('الفئة', d.category)}
      {row('المدرب', d.instructor)}
      {row('المدة (ساعة)', d.duration)}
      {row('المسجّلون', d.enrolledCount)}
      {row('الحالة', d.status)}
      {row('تاريخ البداية', d.startDate ? new Date(d.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {row('تاريخ النهاية', d.endDate ? new Date(d.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {!!d.description && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الوصف</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.description}</Text>
        </View>
      )}
    </ScrollView>
  );
}
