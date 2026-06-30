/**
 * سجلات المهام المجدولة
 * GET /api/automation/cron-logs
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CronLog {
  id: number;
  jobName?: string;
  status?: string;
  durationMs?: number;
  errorMessage?: string;
  startedAt?: string;
  nextRunAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CronLogsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CronLog[]>('/api/automation/cron-logs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجلات المجدول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات المجدول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="timer-outline" title="لا توجد سجلات مجدول" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.jobName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.durationMs != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.durationMs}ms</Text> : null}
              {item.startedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.startedAt)}</Text> : null}
            </View>
            {item.errorMessage ? <Text style={{ fontSize: 11, color: '#EF4444', textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.errorMessage}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
