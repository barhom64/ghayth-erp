import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahCostRow {
  groupId?: number;
  groupName?: string;
  accommodationCost?: number;
  transportCost?: number;
  visaCost?: number;
  guideCost?: number;
  otherCost?: number;
  totalCost?: number;
  pilgrimsCount?: number;
  costPerPilgrim?: number;
}

export default function UmrahCostsReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahCostRow[]>('/api/umrah/reports/umrah-costs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير التكاليف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاليف العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.groupId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.groupName ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{(item.totalCost ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>حجاج: {item.pilgrimsCount ?? 0}</Text>
              {item.costPerPilgrim != null ? <Text style={{ fontSize: 11, color: c.brand }}>للحاج: {item.costPerPilgrim.toLocaleString('ar-SA')}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>إقامة: {(item.accommodationCost ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textFaint }}>نقل: {(item.transportCost ?? 0).toLocaleString('ar-SA')}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
