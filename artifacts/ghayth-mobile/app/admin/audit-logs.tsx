/**
 * سجلات التدقيق
 * GET /api/audit-logs
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AuditLog {
  id: number;
  action?: string;
  entity?: string;
  entityId?: number;
  userId?: number;
  userName?: string;
  ipAddress?: string;
  createdAt?: string;
  after?: Record<string, unknown>;
}

const ACTION_COLOR: Record<string, string> = {
  create: '#22C55E',
  update: '#3B82F6',
  delete: '#EF4444',
  approve: '#8B5CF6',
  reject: '#F59E0B',
  login: '#06B6D4',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
}

export default function AuditLogsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AuditLog[]>('/api/audit-logs');
  const logs = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجلات التدقيق…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات التدقيق' }} />
      <FlatList
        data={logs}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="list-outline" title="لا توجد سجلات" description="لا توجد سجلات تدقيق بعد" />
        }
        renderItem={({ item }) => {
          const color = ACTION_COLOR[item.action?.toLowerCase() ?? ''] ?? c.textMuted;
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={[styles.actionTag, { backgroundColor: color + '20' }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color }}>{item.action ?? '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.entity ?? '—'} #{item.entityId ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.userName ?? `#${item.userId}`}
                </Text>
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                  {fmtDate(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  actionTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 52, alignItems: 'center' },
});
