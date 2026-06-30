/**
 * مراكز التكلفة
 * GET /api/finance/cost-centers
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenter {
  id: number;
  code?: string;
  name?: string;
  type?: string;
  parentName?: string;
  manager?: string;
  budget?: number;
  actualSpend?: number;
  currency?: string;
  isActive?: boolean;
}

export default function CostCentersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostCenter[]>('/api/finance/cost-centers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مراكز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مراكز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pie-chart-outline" title="لا توجد مراكز تكلفة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.code ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.code}</Text> : null}
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.type ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type}</Text> : null}
              {item.parentName ? <Text style={{ fontSize: 11, color: c.textFaint }}>تابع: {item.parentName}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.manager ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.manager}</Text> : null}
              {item.budget != null ? (
                <Text style={{ fontSize: 12, color: c.brand }}>الميزانية: {item.budget.toLocaleString('ar-SA')}</Text>
              ) : null}
              {item.actualSpend != null ? (
                <Text style={{ fontSize: 12, color: item.actualSpend > (item.budget ?? Infinity) ? '#EF4444' : c.text }}>
                  الفعلي: {item.actualSpend.toLocaleString('ar-SA')}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
