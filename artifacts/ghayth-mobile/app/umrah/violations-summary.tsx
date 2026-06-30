import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ViolationsSummary {
  total?: number;
  pending?: number;
  resolved?: number;
  totalDeductions?: number;
  byType?: Array<{ type?: string; count?: number; amount?: number }>;
  [key: string]: unknown;
}

export default function UmrahViolationsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<ViolationsSummary>('/api/umrah/reports/violations-summary');
  const d = (data && !Array.isArray(data)) ? data as ViolationsSummary : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص المخالفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص مخالفات العمرة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: '#EF4444' }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: '#EF4444' }}>{(d?.totalDeductions ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الاستقطاعات (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {[
            { label: 'إجمالي المخالفات', value: d?.total ?? 0, color: c.text },
            { label: 'معلقة', value: d?.pending ?? 0, color: '#F59E0B' },
            { label: 'محلولة', value: d?.resolved ?? 0, color: '#22C55E' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {(d?.byType ?? []).length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>حسب النوع</Text>
            {(d?.byType ?? []).map((t, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.text }}>{t.type ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{t.count ?? 0}</Text>
                  <Text style={{ fontSize: 12, color: '#EF4444' }}>{(t.amount ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
