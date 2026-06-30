import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SaudizationData {
  period?: string;
  totalEmployees?: number;
  saudiCount?: number;
  nonSaudiCount?: number;
  saudizationPercent?: number;
  nitaqatCategory?: string;
  requiredPercent?: number;
}

export default function SaudizationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SaudizationData>('/api/hr/saudization/current');

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات السعودة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = data as SaudizationData | null;
  const pct = d?.saudizationPercent ?? 0;
  const reqPct = d?.requiredPercent ?? 0;
  const color = pct >= reqPct ? '#22C55E' : pct >= reqPct * 0.8 ? '#F59E0B' : '#EF4444';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'نسبة السعودة' }} />
      {d && (
        <>
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, marginBottom: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 48, fontWeight: '800', color }}>{pct.toFixed(1)}%</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>نسبة السعودة الحالية</Text>
            <Text style={{ fontSize: 13, color: c.textFaint, marginTop: 2 }}>المطلوب: {reqPct}%</Text>
          </View>
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 16, gap: 12 }}>
            {d.nitaqatCategory ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>فئة نطاقات</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{d.nitaqatCategory}</Text>
              </View>
            ) : null}
            {d.totalEmployees != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>إجمالي الموظفين</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.totalEmployees}</Text>
              </View>
            ) : null}
            {d.saudiCount != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>سعوديون</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E' }}>{d.saudiCount}</Text>
              </View>
            ) : null}
            {d.nonSaudiCount != null ? (
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>غير سعوديين</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{d.nonSaudiCount}</Text>
              </View>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}
