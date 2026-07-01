import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TimelineEvent { id?: number; step?: string; action?: string; actor?: string; timestamp?: string; notes?: string; }

export default function WorkflowTimeline() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<TimelineEvent[]>(`/api/workflows/${id ?? '0'}/timeline`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الجدول الزمني' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.step ?? item.action ?? ''}</Text>
            {!!item.actor && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.actor}</Text>}
            {!!item.timestamp && <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(item.timestamp).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            {!!item.notes && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.notes}</Text>}
          </View>
        )}
      />
    </View>
  );
}
