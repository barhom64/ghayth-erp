import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InsightsSummary {
  totalInsights?: number;
  actionableInsights?: number;
  criticalCount?: number;
  resolvedCount?: number;
  avgImpactScore?: number;
  topDomain?: string;
  [key: string]: unknown;
}

export default function InsightsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<InsightsSummary>('/api/intelligence/insights-summary');
  const d = (data && !Array.isArray(data)) ? data as InsightsSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الرؤى…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الرؤى' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'إجمالي الرؤى', value: d?.totalInsights ?? 0, color: c.text },
            { label: 'قابلة للتنفيذ', value: d?.actionableInsights ?? 0, color: c.brand },
            { label: 'حرجة', value: d?.criticalCount ?? 0, color: '#EF4444' },
            { label: 'محلولة', value: d?.resolvedCount ?? 0, color: '#22C55E' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {(d?.avgImpactScore != null || d?.topDomain) ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            {d?.avgImpactScore != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>متوسط درجة التأثير</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{d.avgImpactScore}</Text>
              </View>
            ) : null}
            {d?.topDomain ? (
              <>
                <View style={{ height: 1, backgroundColor: c.border }} />
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>النطاق الأعلى</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.topDomain}</Text>
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
