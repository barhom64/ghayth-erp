import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OvertimeSummary {
  totalHours?: number;
  totalCost?: number;
  employees?: number;
  requests?: number;
  approved?: number;
  pending?: number;
  thisMonth?: number;
  byDepartment?: Array<{ departmentName?: string; hours?: number; cost?: number }>;
  [key: string]: unknown;
}

export default function OvertimeSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<OvertimeSummary>('/api/hr/overtime/summary');
  const d = (data && !Array.isArray(data)) ? data as OvertimeSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص العمل الإضافي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص العمل الإضافي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: '#F59E0B' }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: '#F59E0B' }}>{(d?.totalHours ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الساعات الإضافية</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>تكلفة: {(d?.totalCost ?? 0).toLocaleString('ar-SA')} ر.س</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'طلبات معتمدة', value: d?.approved ?? 0, color: '#22C55E' },
            { label: 'قيد المراجعة', value: d?.pending ?? 0, color: '#F59E0B' },
            { label: 'موظفون', value: d?.employees ?? 0, color: c.brand },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {(d?.byDepartment ?? []).length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>حسب القسم</Text>
            {(d?.byDepartment ?? []).map((dep, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.text }}>{dep.departmentName ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                  <Text style={{ fontSize: 12, color: '#F59E0B' }}>{dep.hours ?? 0} ساعة</Text>
                  <Text style={{ fontSize: 12, color: '#EF4444' }}>{(dep.cost ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
