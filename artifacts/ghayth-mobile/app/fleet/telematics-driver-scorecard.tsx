import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DriverScorecard { driverId?: number; driverName?: string; score?: number; speeding?: number; hardBraking?: number; idling?: number; violations?: number; period?: string; }

export default function TelematicsDriverScorecard() {
  const c = useColors();
  const { driverId } = useLocalSearchParams<{ driverId: string }>();
  const { data, isLoading, isError, refetch } = useList<DriverScorecard>(`/api/fleet/telematics/drivers/${driverId ?? '0'}/scorecard`);
  const d = (data && !Array.isArray(data)) ? data as DriverScorecard : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.brand, fontSize: 24, fontWeight: '700' }}>{value ?? '—'}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.driverName ?? 'بطاقة أداء السائق' }} />
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: c.brand, fontSize: 48, fontWeight: '800' }}>{d.score ?? '—'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 14 }}>النقاط الكلية</Text>
      </View>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('تجاوز السرعة', d.speeding)}
        {stat('الكبح المفاجئ', d.hardBraking)}
        {stat('الاشتغال الفارغ', d.idling)}
        {stat('المخالفات', d.violations)}
      </View>
    </ScrollView>
  );
}
