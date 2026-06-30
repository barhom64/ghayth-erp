import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EntityProfile { entityType?: string; entityId?: number; revenue?: number; expenses?: number; netPnl?: number; }

export default function EntityFinancialProfileScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EntityProfile[]>('/api/finance/algorithms/entity-financial-profile');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الملف المالي للكيانات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.entityId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.entityType} #{item.entityId}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
              إيراد: {(item.revenue ?? 0).toLocaleString('ar-SA')} | مصروف: {(item.expenses ?? 0).toLocaleString('ar-SA')} | صافي: {(item.netPnl ?? 0).toLocaleString('ar-SA')}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
