/**
 * سجلات النظام
 * GET /api/admin/system-logs
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemLog {
  id: number;
  level?: 'info' | 'warn' | 'error' | 'debug';
  message?: string;
  source?: string;
  userId?: number;
  userName?: string;
  ip?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

const LEVEL_COLOR: Record<string, string> = {
  error: '#EF4444',
  warn: '#F59E0B',
  info: '#3B82F6',
  debug: '#94A3B8',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return val; }
}

export default function SystemLogsScreen() {
  const c = useColors();
  const [level, setLevel] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useList<SystemLog[]>('/api/admin/system-logs', level ? { level } : undefined);
  const list = Array.isArray(data) ? data : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات النظام' }} />
      <View style={{ flexDirection: 'row-reverse', padding: 8, gap: 6, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {[null, 'error', 'warn', 'info', 'debug'].map(l => {
          const color = l ? (LEVEL_COLOR[l] ?? '#94A3B8') : c.brand;
          const isActive = level === l;
          return (
            <Pressable
              key={l ?? 'all'}
              onPress={() => setLevel(l)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: isActive ? color : c.surface, borderWidth: 1, borderColor: isActive ? color : c.border }}
            >
              <Text style={{ fontSize: 11, color: isActive ? '#fff' : color, fontWeight: '600' }}>{l ?? 'الكل'}</Text>
            </Pressable>
          );
        })}
      </View>
      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : isError ? (
        <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="terminal-outline" title="لا توجد سجلات" description="" />}
          renderItem={({ item }) => {
            const lColor = LEVEL_COLOR[item.level ?? 'info'] ?? '#94A3B8';
            return (
              <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 10, flexDirection: 'row-reverse', gap: 8 }}>
                <View style={{ width: 4, backgroundColor: lColor, borderRadius: 2, alignSelf: 'stretch' }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <View style={{ backgroundColor: lColor + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: lColor, fontWeight: '700' }}>{(item.level ?? 'info').toUpperCase()}</Text>
                    </View>
                    {item.source ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.source}</Text> : null}
                    <Text style={{ fontSize: 10, color: c.textFaint, flex: 1, textAlign: 'left' }}>{fmtDate(item.createdAt)}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: c.text, textAlign: 'right' }} numberOfLines={2}>{item.message ?? '—'}</Text>
                  {item.userName ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>المستخدم: {item.userName}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
