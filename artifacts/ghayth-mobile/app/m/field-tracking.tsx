import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FieldEvent { id?: number; employeeId?: number; employeeName?: string; lat?: number; lng?: number; eventType?: string; recordedAt?: string; }

export default function MyFieldTracking() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FieldEvent[]>('/api/my-field-tracking');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التتبع الميداني' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد أحداث ميدانية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? `موظف ${item.employeeId}`}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.eventType ?? ''} · {item.lat?.toFixed(4) ?? ''}, {item.lng?.toFixed(4) ?? ''}</Text>
            {item.recordedAt && <Text style={{ color: c.textFaint, fontSize: 11, marginTop: 2 }}>{new Date(item.recordedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
