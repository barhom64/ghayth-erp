import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GanttTask {
  id?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  dependencies?: string;
  assigneeName?: string;
}

export default function ProjectGanttScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GanttTask[]>('/api/projects/0/gantt');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مخطط غانت…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مخطط غانت' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد مهام" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.name ?? '—'}</Text>
              {item.progress != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{item.progress}%</Text>
              ) : null}
            </View>
            <View style={{ marginTop: 8, backgroundColor: c.border, borderRadius: 4, height: 6 }}>
              <View style={{ width: `${item.progress ?? 0}%`, backgroundColor: c.brand, borderRadius: 4, height: 6 }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>
                {item.startDate ? new Date(item.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '—'}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>
                {item.endDate ? new Date(item.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '—'}
              </Text>
              {item.assigneeName ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.assigneeName}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
