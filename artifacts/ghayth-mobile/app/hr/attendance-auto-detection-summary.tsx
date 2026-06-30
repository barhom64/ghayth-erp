import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionSummary { totalDetections?: number; verifiedCount?: number; falsePositives?: number; avgConfidence?: number; }

export default function AttendanceAutoDetectionSummary() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AutoDetectionSummary>('/api/hr/attendance/auto-detection/summary');
  const d = (data && !Array.isArray(data)) ? data as AutoDetectionSummary : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الاكتشاف التلقائي' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'إجمالي الاكتشافات', value: d?.totalDetections }, { label: 'اكتشافات مُتحققة', value: d?.verifiedCount }, { label: 'إيجابيات خاطئة', value: d?.falsePositives }, { label: 'متوسط الثقة', value: d?.avgConfidence !== undefined ? `${d.avgConfidence}%` : undefined }].map((row, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{row.value !== undefined ? String(row.value) : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
