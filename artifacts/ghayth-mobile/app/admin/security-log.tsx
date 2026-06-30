/**
 * سجل الأمان
 * GET /api/admin/security-log
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SecurityLog {
  id: number;
  eventType?: string;
  userName?: string;
  ipAddress?: string;
  severity?: string;
  description?: string;
  createdAt?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7F1D1D',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SecurityLogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SecurityLog[]>('/api/admin/security-log');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل الأمان…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل الأمان' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد سجلات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.eventType ?? '—'}</Text>
              {item.severity ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: SEVERITY_COLOR[item.severity] ?? '#94A3B8' }}>
                  <Text style={{ fontSize: 11, color: '#fff' }}>{item.severity}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.userName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.userName}</Text> : null}
              {item.ipAddress ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.ipAddress}</Text> : null}
              {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
