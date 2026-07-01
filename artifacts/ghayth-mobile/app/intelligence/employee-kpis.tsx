import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeKPI { key?: string; label?: string; value?: number | string; unit?: string; }

export default function EmployeeKPIsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeKPI[]>('/api/intelligence/kpis/employee/1');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات أداء الموظف' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد مؤشرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.label ?? item.key ?? ''}</Text>
            <Text style={{ color: c.brand, fontSize: 16, fontWeight: '700' }}>{String(item.value ?? '')} {item.unit ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
