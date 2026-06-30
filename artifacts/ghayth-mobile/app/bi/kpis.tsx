/**
 * مؤشرات الأداء الرئيسية
 * GET /api/bi/kpis
 */
import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface KPI {
  id: number;
  name?: string;
  category?: string;
  value?: number;
  target?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  changePercent?: number;
  status?: 'good' | 'warning' | 'critical';
}

const STATUS_COLOR: Record<string, string> = {
  good: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

export default function KPIsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<KPI[]>('/api/bi/kpis');
  const { refreshing, onRefresh } = useRefresh([['/api/bi/kpis']]);
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المؤشرات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={onRefresh} />
  );

  // Group by category
  const categories = [...new Set(list.map(k => k.category ?? 'عام'))];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات الأداء' }} />
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {list.length === 0 && <GEmptyState icon="analytics-outline" title="لا توجد مؤشرات" description="" />}
        {categories.map(cat => {
          const catKpis = list.filter(k => (k.category ?? 'عام') === cat);
          return (
            <View key={cat}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted, textAlign: 'right', marginBottom: 10 }}>{cat}</Text>
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
                {catKpis.map(kpi => {
                  const statusColor = STATUS_COLOR[kpi.status ?? ''] ?? c.brand;
                  const progress = kpi.target && kpi.value != null ? Math.min(kpi.value / kpi.target, 1) : null;
                  return (
                    <GCard key={kpi.id} style={{ flex: 1, minWidth: 140 }}>
                      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 6 }}>{kpi.name ?? '—'}</Text>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: statusColor }}>
                          {kpi.value != null ? kpi.value : '—'}
                        </Text>
                        {kpi.unit ? <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 3 }}>{kpi.unit}</Text> : null}
                      </View>
                      {kpi.target != null && (
                        <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>
                          الهدف: {kpi.target} {kpi.unit ?? ''}
                        </Text>
                      )}
                      {progress != null && (
                        <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, marginTop: 6 }}>
                          <View style={{ height: 4, backgroundColor: statusColor, borderRadius: 2, width: `${progress * 100}%` }} />
                        </View>
                      )}
                      {kpi.changePercent != null && (
                        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Ionicons
                            name={kpi.trend === 'up' ? 'arrow-up' : kpi.trend === 'down' ? 'arrow-down' : 'remove'}
                            size={12}
                            color={kpi.trend === 'up' ? '#22C55E' : kpi.trend === 'down' ? '#EF4444' : '#94A3B8'}
                          />
                          <Text style={{ fontSize: 11, color: kpi.trend === 'up' ? '#22C55E' : kpi.trend === 'down' ? '#EF4444' : '#94A3B8' }}>
                            {Math.abs(kpi.changePercent)}%
                          </Text>
                        </View>
                      )}
                    </GCard>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
