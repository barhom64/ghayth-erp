import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeProductivity { employeeId?: number; name?: string; tasksCompleted?: number; avgCompletionHours?: number; score?: number; }

export default function EmployeeProductivityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeProductivity[]>('/api/bi/operations/employee-productivity');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إنتاجية الموظفين' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? '-'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>مهام منجزة: {item.tasksCompleted ?? 0} | تقييم: {item.score ?? 0}</Text>
          </View>
        )}
      />
    </View>
  );
}
