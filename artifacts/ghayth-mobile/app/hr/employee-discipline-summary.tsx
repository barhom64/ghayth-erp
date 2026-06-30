import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeDisciplineSummary {
  employeeName?: string;
  totalViolations?: number;
  totalWarnings?: number;
  totalDeductions?: number;
  lastViolationDate?: string;
  currentLevel?: string;
}

export default function EmployeeDisciplineSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<EmployeeDisciplineSummary>('/api/hr/discipline/employee/0/summary');
  const d = (data && !Array.isArray(data)) ? data as EmployeeDisciplineSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الموظف…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص انضباط الموظف' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          {d?.employeeName ? (
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>{d.employeeName}</Text>
          ) : null}
          {[
            { label: 'المخالفات', value: `${d?.totalViolations ?? 0}` },
            { label: 'الإنذارات', value: `${d?.totalWarnings ?? 0}` },
            { label: 'الاستقطاعات', value: `${Number(d?.totalDeductions ?? 0).toLocaleString('ar-SA')} ر.س` },
            { label: 'المستوى الحالي', value: d?.currentLevel ?? '—' },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.text }}>{row.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{row.value}</Text>
            </View>
          ))}
          {d?.lastViolationDate ? (
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
              <Text style={{ fontSize: 14, color: c.text }}>آخر مخالفة</Text>
              <Text style={{ fontSize: 13, color: '#EF4444' }}>
                {new Date(d.lastViolationDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
