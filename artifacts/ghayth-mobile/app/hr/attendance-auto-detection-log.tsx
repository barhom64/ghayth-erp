import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionLog { id?: number; employeeName?: string; method?: string; confidence?: number; detectedAt?: string; verified?: boolean; }

export default function AttendanceAutoDetectionLog() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AutoDetectionLog[]>('/api/hr/attendance/auto-detection/log');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل الاكتشاف التلقائي للحضور' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="eye-outline" title="لا يوجد سجل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? '—'}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.method ?? ''} · ثقة: {item.confidence ?? 0}%</Text>
            </View>
            <Text style={{ color: item.verified ? '#22c55e' : '#f59e0b', fontSize: 12 }}>{item.verified ? 'مُتحقق' : 'غير مُتحقق'}</Text>
          </View>
        )}
      />
    </View>
  );
}
