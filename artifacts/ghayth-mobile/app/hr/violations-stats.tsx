import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ViolationsStats {
  total?: number;
  thisMonth?: number;
  totalDeductions?: number;
  [key: string]: unknown;
}

export default function ViolationsStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ViolationsStats>('/api/hr/violations-stats');
  const d = (data && !Array.isArray(data)) ? data as ViolationsStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات المخالفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات المخالفات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: '#EF4444' }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: '#EF4444' }}>{d?.totalDeductions != null ? d.totalDeductions.toLocaleString('ar-SA') : '0'}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الاستقطاعات (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: c.text }}>{d?.total ?? 0}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>إجمالي المخالفات</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#F59E0B' }}>{d?.thisMonth ?? 0}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>هذا الشهر</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
