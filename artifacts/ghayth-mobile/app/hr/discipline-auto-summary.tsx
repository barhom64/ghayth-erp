import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionSummary {
  totalDetected?: number;
  pendingReview?: number;
  autoApplied?: number;
  dismissed?: number;
  lastRun?: string;
}

export default function HrDisciplineAutoSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AutoDetectionSummary>('/api/hr/discipline/auto-detection/summary');
  const d = (data && !Array.isArray(data)) ? data as AutoDetectionSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الاكتشاف التلقائي…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'إجمالي المكتشفات', value: d?.totalDetected != null ? String(d.totalDetected) : '—' },
    { label: 'بانتظار المراجعة', value: d?.pendingReview != null ? String(d.pendingReview) : '—' },
    { label: 'طُبِّق تلقائيًا', value: d?.autoApplied != null ? String(d.autoApplied) : '—' },
    { label: 'مُرفَض', value: d?.dismissed != null ? String(d.dismissed) : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الاكتشاف التلقائي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
        {d?.lastRun ? (
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'center' }}>
            آخر تشغيل: {new Date(d.lastRun).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
