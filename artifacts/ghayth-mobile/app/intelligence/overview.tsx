import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IntelligenceOverview { alertCount?: number; criticalAlerts?: number; kpiCount?: number; kpisOffTarget?: number; suggestionsCount?: number; lastUpdated?: string; }

export default function IntelligenceOverview() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IntelligenceOverview>('/api/intelligence/overview');
  const d = (data && !Array.isArray(data)) ? data as IntelligenceOverview : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number | string, color?: string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: color ?? c.brand, fontSize: 24, fontWeight: '700' }}>{value ?? '—'}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'نظرة عامة - الذكاء التشغيلي' }} />
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('إجمالي التنبيهات', d.alertCount)}
        {stat('تنبيهات حرجة', d.criticalAlerts, '#ef4444')}
        {stat('إجمالي المؤشرات', d.kpiCount)}
        {stat('مؤشرات خارج الهدف', d.kpisOffTarget, '#f59e0b')}
        {stat('اقتراحات', d.suggestionsCount)}
      </View>
      {!!d.lastUpdated && (
        <Text style={{ color: c.textFaint, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          آخر تحديث: {new Date(d.lastUpdated).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      )}
    </ScrollView>
  );
}
