import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisciplineStats {
  totalCases?: number;
  openCases?: number;
  closedCases?: number;
  thisMonth?: number;
  totalDeductions?: number;
  warningsCount?: number;
  suspensionsCount?: number;
  terminations?: number;
  [key: string]: unknown;
}

export default function DisciplineStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<DisciplineStats>('/api/hr/stats');
  const d = (data && !Array.isArray(data)) ? data as DisciplineStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات التأديب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات التأديب' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: '#EF4444' }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: '#EF4444' }}>{d?.totalCases ?? 0}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي القضايا</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'مفتوحة', value: d?.openCases ?? 0, color: '#F59E0B' },
            { label: 'مغلقة', value: d?.closedCases ?? 0, color: '#22C55E' },
            { label: 'هذا الشهر', value: d?.thisMonth ?? 0, color: '#EF4444' },
            { label: 'إنذارات', value: d?.warningsCount ?? 0, color: '#F59E0B' },
            { label: 'إيقاف', value: d?.suspensionsCount ?? 0, color: '#EF4444' },
            { label: 'فسخ عقد', value: d?.terminations ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.totalDeductions != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>إجمالي الاستقطاعات</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>{d.totalDeductions.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
