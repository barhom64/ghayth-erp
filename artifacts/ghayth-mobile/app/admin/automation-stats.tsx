import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutomationStats {
  total?: number;
  today?: number;
  week?: number;
  byType?: { automationType?: string; count?: number }[];
  byModule?: { module?: string; count?: number }[];
  [key: string]: unknown;
}

export default function AutomationStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AutomationStats>('/api/automation/automation-stats');
  const d = (data && !Array.isArray(data)) ? data as AutomationStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الأتمتة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الأتمتة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 4 }}>
          {[
            { label: 'الإجمالي', value: String(d?.total ?? 0), color: c.brand },
            { label: 'اليوم', value: String(d?.today ?? 0), color: '#22C55E' },
            { label: 'الأسبوع', value: String(d?.week ?? 0), color: '#F59E0B' },
          ].map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.byType && d.byType.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>حسب النوع</Text>
            {d.byType.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: i < d.byType!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.text }}>{item.automationType ?? '—'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {d?.byModule && d.byModule.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>حسب المسار</Text>
            {d.byModule.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: i < d.byModule!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.text }}>{item.module ?? '—'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
