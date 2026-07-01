import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KpiItem { key?: string; value?: number | string; label?: string; }

export default function EmployeeKpis() {
  const c = useColors();
  const { employeeId } = useLocalSearchParams<{ employeeId: string }>();
  const { data, isLoading, isError, refetch } = useList<KpiItem[]>(`/api/intelligence/kpis/employee/${employeeId}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مؤشرات الموظف' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد مؤشرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{item.label ?? item.key ?? ''}</Text>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{String(item.value ?? '—')}</Text>
          </View>
        )}
      />
    </View>
  );
}
