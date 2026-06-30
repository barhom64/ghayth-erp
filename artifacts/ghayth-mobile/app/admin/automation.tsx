/**
 * الأتمتة والمهام المجدولة
 * GET /api/automation/cron-jobs
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

type AutoTab = 'cron' | 'logs';

interface CronJob {
  id: number | string;
  name?: string;
  cronExpression?: string;
  description?: string;
  isActive?: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: string;
}

interface CronLog {
  id: number;
  jobName?: string;
  status?: string;
  duration?: number;
  error?: string;
  createdAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function AutomationScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [tab, setTab] = useState<AutoTab>('cron');

  const { data: jobs, isLoading: loadJ, refetch: refetchJ } = useList<CronJob[]>('/api/automation/cron-jobs');
  const { data: logs, isLoading: loadL, refetch: refetchL } = useList<CronLog[]>('/api/automation/cron-logs');

  const cronList = Array.isArray(jobs) ? jobs : [];
  const logList = Array.isArray(logs) ? logs : [];

  async function toggle(id: number | string) {
    await apiFetch(`/api/automation/cron-jobs/${id}/toggle`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/automation/cron-jobs'] });
  }

  async function trigger(id: number | string) {
    await apiFetch(`/api/automation/cron-jobs/${id}/trigger`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/automation/cron-logs'] });
  }

  const TABS = [
    { key: 'cron' as AutoTab, label: 'المهام المجدولة', icon: 'timer-outline' },
    { key: 'logs' as AutoTab, label: 'السجل', icon: 'list-outline' },
  ];

  const isLoading = tab === 'cron' ? loadJ : loadL;
  const refetch = tab === 'cron' ? refetchJ : refetchL;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأتمتة' }} />
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={15} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'cron' ? (
        <FlatList
          data={cronList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="timer-outline" title="لا توجد مهام" description="" />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.name ?? '—'}</Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
                </View>
                {item.cronExpression ? (
                  <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right', fontFamily: 'monospace', marginTop: 2 }}>
                    {item.cronExpression}
                  </Text>
                ) : null}
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.description}</Text>
                ) : null}
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>
                  آخر تشغيل: {fmtDate(item.lastRunAt)}
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <GButton title={item.isActive ? 'إيقاف' : 'تفعيل'} variant={item.isActive ? 'secondary' : 'primary'} size="sm" onPress={() => toggle(item.id)} />
                <GButton title="تشغيل" variant="secondary" size="sm" onPress={() => trigger(item.id)} />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={logList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد سجلات" description="" />}
          renderItem={({ item }) => {
            const color = item.status === 'success' ? '#22C55E' : item.status === 'error' ? '#EF4444' : '#F59E0B';
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={{ width: 6, height: '100%', backgroundColor: color, borderRadius: 3, alignSelf: 'stretch' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.jobName ?? '—'}</Text>
                  {item.error ? <Text style={{ fontSize: 11, color: '#EF4444', textAlign: 'right', marginTop: 2 }}>{item.error}</Text> : null}
                  <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 4 }}>
                    {item.duration != null && <Text style={{ fontSize: 11, color: c.textMuted }}>{item.duration}ms</Text>}
                    <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
