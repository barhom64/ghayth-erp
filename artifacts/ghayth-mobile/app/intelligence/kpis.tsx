import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KPI { id?: number; name?: string; value?: number | string; target?: number | string; unit?: string; trend?: string; category?: string; }

export default function IntelligenceKPIs() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KPI[]>('/api/intelligence/kpis');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات الأداء الرئيسية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد مؤشرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.name ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: c.brand, fontSize: 18, fontWeight: '700' }}>{item.value ?? '—'}{item.unit ? ` ${item.unit}` : ''}</Text>
              {item.target !== undefined && <Text style={{ color: c.textMuted, fontSize: 13 }}>الهدف: {item.target}{item.unit ? ` ${item.unit}` : ''}</Text>}
            </View>
            {!!item.category && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>{item.category}</Text>}
          </View>
        )}
      />
    </View>
  );
}
