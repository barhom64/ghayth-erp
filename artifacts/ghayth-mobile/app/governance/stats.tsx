import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GovernanceStats {
  totalPolicies?: number;
  openRisks?: number;
  activeAudits?: number;
  nonCompliant?: number;
  complianceRate?: number;
  complianceActionsTotal?: number;
  complianceActionsImplemented?: number;
  openCapas?: number;
  risksNoTreatment?: number;
  [key: string]: unknown;
}

export default function GovernanceStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<GovernanceStats>('/api/governance/stats');
  const d = (data && !Array.isArray(data)) ? data as GovernanceStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الحوكمة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const rate = d?.complianceRate ?? 0;
  const rateColor = rate >= 80 ? '#22C55E' : rate >= 60 ? '#F59E0B' : '#EF4444';

  const metrics = [
    { label: 'إجمالي السياسات', value: String(d?.totalPolicies ?? 0), color: c.brand },
    { label: 'مخاطر مفتوحة', value: String(d?.openRisks ?? 0), color: (d?.openRisks ?? 0) > 0 ? '#EF4444' : c.text },
    { label: 'تدقيقات نشطة', value: String(d?.activeAudits ?? 0), color: '#F59E0B' },
    { label: 'غير ممتثل', value: String(d?.nonCompliant ?? 0), color: (d?.nonCompliant ?? 0) > 0 ? '#EF4444' : c.text },
    { label: 'CAPAs مفتوحة', value: String(d?.openCapas ?? 0), color: (d?.openCapas ?? 0) > 0 ? '#F59E0B' : c.text },
    { label: 'مخاطر بلا خطة', value: String(d?.risksNoTreatment ?? 0), color: (d?.risksNoTreatment ?? 0) > 0 ? '#EF4444' : c.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الحوكمة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16, borderTopWidth: 4, borderTopColor: rateColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: rateColor }}>{rate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل الامتثال</Text>
          {d?.complianceActionsTotal ? (
            <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 4 }}>
              {d.complianceActionsImplemented ?? 0} / {d.complianceActionsTotal} إجراء منفّذ
            </Text>
          ) : null}
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
