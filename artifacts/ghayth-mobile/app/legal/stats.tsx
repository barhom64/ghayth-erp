import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalStats {
  totalCases?: number;
  activeCases?: number;
  wonCases?: number;
  lostCases?: number;
  pendingCases?: number;
  totalContracts?: number;
  expiringContracts?: number;
  upcomingSessions?: number;
  totalJudgments?: number;
  [key: string]: unknown;
}

export default function LegalStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<LegalStats>('/api/legal/stats');
  const d = (data && !Array.isArray(data)) ? data as LegalStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الشؤون القانونية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const total = d?.totalCases ?? 0;
  const won = d?.wonCases ?? 0;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const winColor = winRate >= 70 ? '#22C55E' : winRate >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الشؤون القانونية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: winColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: winColor }}>{winRate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة الفوز</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{won} من {total} قضية</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'قضايا نشطة', value: d?.activeCases ?? 0, color: '#3B82F6' },
            { label: 'معلقة', value: d?.pendingCases ?? 0, color: '#F59E0B' },
            { label: 'خسائر', value: d?.lostCases ?? 0, color: '#EF4444' },
            { label: 'جلسات قادمة', value: d?.upcomingSessions ?? 0, color: c.brand },
            { label: 'عقود', value: d?.totalContracts ?? 0, color: c.text },
            { label: 'عقود تنتهي', value: d?.expiringContracts ?? 0, color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
