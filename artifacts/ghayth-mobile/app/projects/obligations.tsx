/**
 * الالتزامات التعاقدية
 * GET /api/obligations
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface Obligation {
  id: number;
  title?: string;
  entityType?: string;
  entityId?: number;
  obligationType?: string;
  status?: string;
  dueAt?: string;
  metAt?: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  met: '#22C55E',
  overdue: '#EF4444',
  cancelled: '#94A3B8',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ObligationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Obligation[]>('/api/obligations');
  const list = Array.isArray(data) ? data : [];

  async function markMet(id: number) {
    await apiFetch(`/api/obligations/${id}/met`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/obligations'] });
  }

  async function cancel(id: number) {
    await apiFetch(`/api/obligations/${id}/cancel`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/obligations'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الالتزامات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الالتزامات التعاقدية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-circle-outline" title="لا توجد التزامات" description="" />}
        renderItem={({ item }) => {
          const color = STATUS_COLOR[item.status ?? ''] ?? '#94A3B8';
          const isOverdue = item.status === 'overdue' || (item.status === 'pending' && item.dueAt && new Date(item.dueAt) < new Date());
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ width: 4, backgroundColor: isOverdue ? '#EF4444' : color, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                  {item.entityType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.entityType}</Text> : null}
                  {item.obligationType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.obligationType}</Text> : null}
                </View>
                <Text style={{ fontSize: 11, color: isOverdue ? '#EF4444' : c.textFaint, textAlign: 'right', marginTop: 4 }}>
                  الاستحقاق: {fmtDate(item.dueAt)}
                </Text>
                {item.status === 'pending' && (
                  <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10 }}>
                    <GButton title="مُنجز" variant="primary" size="sm" onPress={() => markMet(item.id)} />
                    <GButton title="إلغاء" variant="secondary" size="sm" onPress={() => cancel(item.id)} />
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, gap: 10 },
});
