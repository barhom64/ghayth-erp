import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ComplianceDashboard {
  overallScore?: number;
  totalControls?: number;
  compliantControls?: number;
  openFindings?: number;
  overdueActions?: number;
  riskLevel?: string;
  [key: string]: unknown;
}

export default function ComplianceDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ComplianceDashboard>('/api/governance/compliance-dashboard');
  const d = (data && !Array.isArray(data)) ? data as ComplianceDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الامتثال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const score = d?.overallScore ?? 0;
  const scoreColor = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';

  const metrics = [
    { label: 'إجمالي الضوابط', value: String(d?.totalControls ?? 0), color: c.brand },
    { label: 'ضوابط ممتثلة', value: String(d?.compliantControls ?? 0), color: '#22C55E' },
    { label: 'نتائج مفتوحة', value: String(d?.openFindings ?? 0), color: (d?.openFindings ?? 0) > 0 ? '#EF4444' : c.text },
    { label: 'إجراءات متأخرة', value: String(d?.overdueActions ?? 0), color: (d?.overdueActions ?? 0) > 0 ? '#EF4444' : c.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الامتثال' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16, borderTopWidth: 4, borderTopColor: scoreColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: scoreColor }}>{score.toFixed(0)}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>درجة الامتثال الإجمالية</Text>
          {d?.riskLevel ? <Text style={{ fontSize: 12, color: scoreColor, marginTop: 4, fontWeight: '700' }}>مستوى المخاطر: {d.riskLevel}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: m.color, marginBottom: 4 }}>{m.value}</Text>
              <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
