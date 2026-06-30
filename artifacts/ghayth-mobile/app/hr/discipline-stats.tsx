import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisciplineStats {
  totalViolations?: number;
  totalWarnings?: number;
  totalSuspensions?: number;
  totalTerminations?: number;
  byDepartment?: { departmentName: string; count: number }[];
}

export default function DisciplineStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<DisciplineStats>('/api/hr/discipline/stats');
  const d = (data && !Array.isArray(data)) ? data as DisciplineStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الانضباط…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الانضباط' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          {[
            { label: 'إجمالي المخالفات', value: d?.totalViolations ?? 0, color: '#EF4444' },
            { label: 'الإنذارات', value: d?.totalWarnings ?? 0, color: '#F59E0B' },
            { label: 'الإيقاف عن العمل', value: d?.totalSuspensions ?? 0, color: '#F97316' },
            { label: 'الفصل', value: d?.totalTerminations ?? 0, color: '#DC2626' },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.text }}>{row.label}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: row.color }}>{row.value}</Text>
            </View>
          ))}
        </View>
        {(d?.byDepartment?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 12 }}>حسب القسم</Text>
            {d!.byDepartment!.map((dep, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.byDepartment!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text }}>{dep.departmentName}</Text>
                <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>{dep.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
