import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DeptData { department?: string; employees?: number; tasks?: number; }

export default function DashboardChartsDepartments() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DeptData[]>('/api/dashboard/charts/departments');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخطط الأقسام' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.department ?? String(i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.department ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.employees ?? 0} موظف</Text>
          </View>
        )}
      />
    </View>
  );
}
