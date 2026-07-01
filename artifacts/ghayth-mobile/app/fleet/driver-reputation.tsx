import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Reputation { reputationScore?: number; tripCount?: number; violationCount?: number; accidentCount?: number; }

export default function DriverReputation() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Reputation>(`/api/fleet/drivers/${id}/reputation`);
  const rep = (data && !Array.isArray(data)) ? data as Reputation : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !rep) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const rows: { label: string; value: string }[] = [
    { label: 'نقاط السمعة', value: String(rep.reputationScore ?? 0) },
    { label: 'عدد الرحلات', value: String(rep.tripCount ?? 0) },
    { label: 'عدد المخالفات', value: String(rep.violationCount ?? 0) },
    { label: 'عدد الحوادث', value: String(rep.accidentCount ?? 0) },
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سمعة السائق' }} />
      {rows.map(r => (
        <View key={r.label} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{r.label}</Text>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{r.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
