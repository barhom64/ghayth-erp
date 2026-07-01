import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendancePoint { period?: string; rate?: number; present?: number; absent?: number; }

export default function DashboardChartsAttendance() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AttendancePoint[]>('/api/dashboard/charts/attendance');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحضور…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخطط الحضور' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              <Text style={{ color: '#22c55e', fontSize: 12 }}>حاضر: {item.present ?? 0}</Text>
              <Text style={{ color: '#ef4444', fontSize: 12 }}>غائب: {item.absent ?? 0}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>معدل: {item.rate ?? 0}%</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
