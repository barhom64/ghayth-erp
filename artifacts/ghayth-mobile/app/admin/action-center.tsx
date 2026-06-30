/**
 * مركز الإجراءات
 * GET /api/action-center
 * GET /api/action-center/pending
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

type ACTab = 'pending' | 'all';

interface ActionItem {
  id: number;
  type?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  entityType?: string;
  entityId?: number;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ActionCenterScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [tab, setTab] = useState<ACTab>('pending');

  const endpoint = tab === 'pending' ? '/api/action-center/pending' : '/api/action-center';
  const { data, isLoading, refetch } = useList<ActionItem[]>(endpoint);
  const list = Array.isArray(data) ? data : [];

  async function act(id: number, action: 'approve' | 'reject') {
    await apiFetch(`/api/workflows/${id}/${action}`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [endpoint] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مركز الإجراءات' }} />
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {([['pending', 'قيد الإجراء'], ['all', 'الكل']] as [ACTab, string][]).map(([key, label]) => (
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
      ) : (
        <FlatList
          data={list}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد إجراءات" description="" />}
          renderItem={({ item }) => {
            const pColor = PRIORITY_COLOR[item.priority ?? ''] ?? '#94A3B8';
            return (
              <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
                <View style={{ width: 4, backgroundColor: pColor, borderRadius: 2, alignSelf: 'stretch' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                  {item.description ? (
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                    {item.entityType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.entityType}</Text> : null}
                    <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text>
                  </View>
                  {item.status === 'pending' && (
                    <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10 }}>
                      <GButton title="موافقة" variant="primary" size="sm" onPress={() => act(item.id, 'approve')} />
                      <GButton title="رفض" variant="secondary" size="sm" onPress={() => act(item.id, 'reject')} />
                    </View>
                  )}
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
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, gap: 10 },
});
