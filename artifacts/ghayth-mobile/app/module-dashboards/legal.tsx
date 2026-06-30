import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalModuleDashboard {
  activeCases?: number;
  pendingHearings?: number;
  wonCases?: number;
  lostCases?: number;
  totalLiability?: number;
  expiringContracts?: number;
  [key: string]: unknown;
}

export default function ModuleDashboardLegalScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<LegalModuleDashboard>('/api/module-dashboards/legal');
  const d = (data && !Array.isArray(data)) ? data as LegalModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة القانونية…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const metrics = [
    { label: 'القضايا النشطة', value: d?.activeCases ?? 0, color: c.brand },
    { label: 'جلسات قادمة', value: d?.pendingHearings ?? 0, color: '#F59E0B' },
    { label: 'قضايا مكسوبة', value: d?.wonCases ?? 0, color: '#22C55E' },
    { label: 'قضايا خاسرة', value: d?.lostCases ?? 0, color: '#EF4444' },
    { label: 'عقود منتهية قريبًا', value: d?.expiringContracts ?? 0, color: '#F59E0B' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة القانونية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ flex: 1, minWidth: '45%', backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.totalLiability != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>إجمالي الالتزامات</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>{d.totalLiability.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
