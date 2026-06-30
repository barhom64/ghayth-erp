import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduleItem {
  id?: number;
  title?: string;
  type?: string;
  dueAt?: string;
  priority?: string;
  assigneeName?: string;
}

function fmtTime(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const priorityColor: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' };

export default function DailyScheduleScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduleItem[]>('/api/intelligence/daily-schedule');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الجدول اليومي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الجدول اليومي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="الجدول اليومي فارغ" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: priorityColor[item.priority ?? ''] ?? c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              {item.dueAt ? <Text style={{ fontSize: 11, color: c.brand }}>{fmtTime(item.dueAt)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.type ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.type}</Text> : null}
              {item.assigneeName ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.assigneeName}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
