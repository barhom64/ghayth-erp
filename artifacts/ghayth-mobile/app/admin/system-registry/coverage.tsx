import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CoverageStat {
  domain?: string;
  totalEntities?: number;
  withAudit?: number;
  withRbac?: number;
  withTests?: number;
  coveragePct?: number;
}

export default function SystemRegistryCoverageScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CoverageStat[]>('/api/admin/system-registry/coverage');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تغطية السجل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تغطية سجل النظام' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {list.length === 0 ? (
          <GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />
        ) : list.map((item, i) => {
          const pct = Math.round(item.coveragePct ?? 0);
          const color = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <View key={i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.domain ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color }}>{pct}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, marginBottom: 8 }}>
                <View style={{ height: 6, backgroundColor: color, borderRadius: 3, width: `${Math.min(pct, 100)}%` as never }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{item.totalEntities ?? 0} كيان</Text>
                <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ {item.withAudit ?? 0} تدقيق</Text>
                <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ {item.withRbac ?? 0} RBAC</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
