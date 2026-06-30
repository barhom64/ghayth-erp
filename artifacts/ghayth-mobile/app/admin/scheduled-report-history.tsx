import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduledReportRun {
  id?: number;
  reportName?: string;
  status?: string;
  ranAt?: string;
  duration?: number;
  recipientCount?: number;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ScheduledReportHistoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduledReportRun[]>('/api/scheduled-reports/history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل التقارير المجدولة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل تنفيذ التقارير' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا يوجد سجل تنفيذ" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.reportName ?? `تقرير #${item.id}`}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.ranAt)}</Text>
              {item.duration != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.duration}ث</Text> : null}
              {item.recipientCount != null ? <Text style={{ fontSize: 11, color: c.brand }}>{item.recipientCount} مستلم</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
