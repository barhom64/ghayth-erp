/**
 * تقرير مستوى الخدمة SLA
 * GET /api/support/sla-report
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SlaMetric {
  id: number;
  category?: string;
  priority?: string;
  totalTickets?: number;
  resolvedWithinSla?: number;
  breachedSla?: number;
  avgResolutionTime?: number;
  slaPercentage?: number;
  period?: string;
}

export default function SlaReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SlaMetric[]>('/api/support/sla-report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير SLA…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير مستوى الخدمة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.id ? String(item.id) : `${item.category}-${i}`}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="analytics-outline" title="لا توجد بيانات SLA" description="" />}
        renderItem={({ item }) => {
          const pct = item.slaPercentage ?? 0;
          const pctColor = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.category ?? '—'}</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: pctColor }}>{pct.toFixed(1)}%</Text>
              </View>
              {item.priority ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right', marginBottom: 6 }}>الأولوية: {item.priority}</Text> : null}
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, marginBottom: 8 }}>
                <View style={{ height: 6, width: `${Math.min(pct, 100)}%` as never, backgroundColor: pctColor, borderRadius: 3 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
                {item.totalTickets != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.totalTickets}</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>إجمالي</Text>
                  </View>
                ) : null}
                {item.resolvedWithinSla != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#22C55E' }}>{item.resolvedWithinSla}</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>في الوقت</Text>
                  </View>
                ) : null}
                {item.breachedSla != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444' }}>{item.breachedSla}</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>تجاوز</Text>
                  </View>
                ) : null}
                {item.avgResolutionTime != null ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.avgResolutionTime}س</Text>
                    <Text style={{ fontSize: 10, color: c.textMuted }}>متوسط</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
