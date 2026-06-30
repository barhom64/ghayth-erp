import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CompanyKpi {
  key?: string;
  label?: string;
  value?: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  target?: number;
}

export default function CompanyKpisScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CompanyKpi[]>('/api/intelligence/company-kpis');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مؤشرات الأداء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات أداء الشركة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {list.length === 0 ? <GEmptyState icon="bar-chart-outline" title="لا توجد مؤشرات" description="" /> : null}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {list.map((kpi, i) => (
            <View key={kpi.key ?? i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, minWidth: 140, flex: 1 }}>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{kpi.label ?? kpi.key ?? '—'}</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: c.brand, textAlign: 'right' }}>{String(kpi.value ?? '—')}{kpi.unit ? ` ${kpi.unit}` : ''}</Text>
              {kpi.trend ? <Text style={{ fontSize: 11, color: kpi.trend === 'up' ? '#22C55E' : kpi.trend === 'down' ? '#EF4444' : c.textFaint, textAlign: 'right' }}>{kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '—'}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
