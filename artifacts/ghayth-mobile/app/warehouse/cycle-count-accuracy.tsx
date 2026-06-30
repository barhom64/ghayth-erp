import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CycleCountAccuracy {
  period?: string;
  warehouseId?: number;
  warehouseName?: string;
  totalLines?: number;
  accurateLines?: number;
  accuracyPct?: number;
}

export default function CycleCountAccuracyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CycleCountAccuracy[]>('/api/reports/cycle-count-accuracy');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دقة جرد الدورة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دقة جرد الدورة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.period}-${item.warehouseId ?? i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات دقة الجرد" description="" />}
        renderItem={({ item }) => {
          const pct = item.accuracyPct ?? 0;
          const pctColor = pct >= 95 ? '#22C55E' : pct >= 85 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.warehouseName ?? `مستودع #${item.warehouseId}`}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: pctColor }}>{pct.toFixed(1)}%</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                <View style={{ height: 6, width: `${Math.min(pct, 100)}%` as never, backgroundColor: pctColor, borderRadius: 3 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
                {item.accurateLines != null && item.totalLines != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.accurateLines} / {item.totalLines} سطر</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
