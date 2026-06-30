/**
 * مراقب الأحداث
 * GET /api/events/log
 * GET /api/events/catalog
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

type EventTab = 'log' | 'catalog';

interface EventLog {
  id: number;
  eventType?: string;
  entityType?: string;
  entityId?: number;
  status?: string;
  error?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
}

interface EventCatalog {
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const STATUS_COLOR: Record<string, string> = {
  delivered: '#22C55E',
  failed: '#EF4444',
  pending: '#F59E0B',
  processing: '#3B82F6',
};

export default function EventMonitorScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [tab, setTab] = useState<EventTab>('log');

  const { data: logData, isLoading: loadL, refetch: refL } = useList<EventLog[]>('/api/events/log');
  const { data: catalogData, isLoading: loadC, refetch: refC } = useList<EventCatalog[]>('/api/events/catalog');

  const logs = Array.isArray(logData) ? logData : [];
  const catalog = Array.isArray(catalogData) ? catalogData : [];

  async function drain() {
    await apiFetch('/api/events/outbox/drain', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/events/log'] });
  }

  const isLoading = tab === 'log' ? loadL : loadC;
  const refetch = tab === 'log' ? refL : refC;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مراقب الأحداث' }} />
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {([['log', 'سجل الأحداث'], ['catalog', 'الكتالوج']] as [EventTab, string][]).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === key ? c.brand : c.textMuted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'log' ? (
        <FlatList
          data={logs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListHeaderComponent={(
            <View style={{ padding: 12 }}>
              <GButton title="تصريف الصندوق" variant="secondary" size="sm" onPress={drain} />
            </View>
          )}
          ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا توجد أحداث" description="" />}
          renderItem={({ item }) => {
            const color = STATUS_COLOR[item.status ?? ''] ?? '#94A3B8';
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={{ width: 4, backgroundColor: color, borderRadius: 2, alignSelf: 'stretch' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.eventType ?? '—'}</Text>
                  <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 2 }}>
                    {item.entityType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.entityType}</Text> : null}
                    {item.entityId ? <Text style={{ fontSize: 11, color: c.textMuted }}>#{item.entityId}</Text> : null}
                  </View>
                  {item.error ? <Text style={{ fontSize: 11, color: '#EF4444', textAlign: 'right', marginTop: 2 }}>{item.error}</Text> : null}
                  <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 4 }}>{fmtDate(item.createdAt)}</Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={catalog}
          keyExtractor={(item, i) => item.name ?? String(i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد أحداث مسجلة" description="" />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                {item.description ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>{item.description}</Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, gap: 10 },
});
