import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrModuleDashboard {
  employees?: { total?: number; active?: number };
  attendance?: { present?: number; absent?: number; late?: number; avgLateMinutes?: number };
  leaves?: { pending?: number; approved?: number; rejected?: number };
  violations?: { total?: number; totalDeductions?: number };
  expiringContracts?: number;
  evaluations?: number;
  [key: string]: unknown;
}

export default function HrModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<HrModuleDashboard>('/api/module-dashboards/hr');
  const d = (data && !Array.isArray(data)) ? data as HrModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة الموارد البشرية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الموارد البشرية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Employees */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الموظفون</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: c.brand }}>{d?.employees?.total ?? 0}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>الإجمالي</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: '#22C55E' }}>{d?.employees?.active ?? 0}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>نشط</Text>
            </View>
          </View>
        </View>
        {/* Attendance today */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الحضور اليوم</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'حاضر', value: d?.attendance?.present ?? 0, color: '#22C55E' },
              { label: 'غائب', value: d?.attendance?.absent ?? 0, color: '#EF4444' },
              { label: 'متأخر', value: d?.attendance?.late ?? 0, color: '#F59E0B' },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Leaves */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الإجازات</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'معلقة', value: d?.leaves?.pending ?? 0, color: '#F59E0B' },
              { label: 'معتمدة', value: d?.leaves?.approved ?? 0, color: '#22C55E' },
              { label: 'مرفوضة', value: d?.leaves?.rejected ?? 0, color: '#EF4444' },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Other stats */}
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#EF4444' }}>{d?.violations?.total ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>مخالفات</Text>
            <Text style={{ fontSize: 11, color: c.textFaint }}>{(d?.violations?.totalDeductions ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#F59E0B' }}>{d?.expiringContracts ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>عقود تنتهي</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
