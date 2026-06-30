import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IntelligenceOverview {
  totalAlerts?: number;
  criticalAlerts?: number;
  suggestions?: number;
  activeModels?: number;
  lastRunAt?: string;
  [key: string]: unknown;
}

export default function IntelligenceOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<IntelligenceOverview>('/api/intelligence/overview');
  const d = (data && !Array.isArray(data)) ? data as IntelligenceOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة الذكاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة — الذكاء' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'تنبيهات حرجة', value: d?.criticalAlerts ?? 0, color: '#EF4444' },
            { label: 'إجمالي التنبيهات', value: d?.totalAlerts ?? 0, color: '#F59E0B' },
            { label: 'اقتراحات', value: d?.suggestions ?? 0, color: c.brand },
            { label: 'نماذج نشطة', value: d?.activeModels ?? 0, color: '#22C55E' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.lastRunAt ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>آخر تشغيل</Text>
            <Text style={{ fontSize: 13, color: c.text }}>{new Date(d.lastRunAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
