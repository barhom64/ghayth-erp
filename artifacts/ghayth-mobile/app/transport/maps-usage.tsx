import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MapsUsage {
  totalRequests?: number;
  geocodeRequests?: number;
  routeRequests?: number;
  distanceRequests?: number;
  costEstimate?: number;
  threshold?: number;
  [key: string]: unknown;
}

export default function TransportMapsUsageScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<MapsUsage>('/api/transport/maps-usage');
  const d = (data && !Array.isArray(data)) ? data as MapsUsage : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل استهلاك الخرائط…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const used = d?.totalRequests ?? 0;
  const threshold = d?.threshold ?? 0;
  const pct = threshold > 0 ? Math.round((used / threshold) * 100) : 0;
  const color = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#22C55E';

  const metrics = [
    { label: 'جيوكود', value: d?.geocodeRequests ?? 0 },
    { label: 'مسارات', value: d?.routeRequests ?? 0 },
    { label: 'مسافات', value: d?.distanceRequests ?? 0 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'استهلاك الخرائط' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: color }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color }}>{used.toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الطلبات</Text>
          {threshold > 0 ? (
            <>
              <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4, width: '100%', marginTop: 12 }}>
                <View style={{ height: 8, backgroundColor: color, borderRadius: 4, width: `${Math.min(pct, 100)}%` as never }} />
              </View>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{pct}% من الحد المسموح</Text>
            </>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: c.brand }}>{m.value.toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.costEstimate != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>التكلفة التقديرية</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>${d.costEstimate.toFixed(2)}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
