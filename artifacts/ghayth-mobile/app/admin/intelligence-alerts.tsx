/**
 * تنبيهات الذكاء التشغيلي
 * GET /api/intelligence/alerts
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface Alert {
  id: number;
  type?: string;
  severity?: string;
  title?: string;
  message?: string;
  source?: string;
  dismissed?: boolean;
  createdAt?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#22C55E',
  info: '#94A3B8',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: 'alert-circle',
  high: 'warning',
  medium: 'information-circle',
  low: 'checkmark-circle',
};

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function IntelligenceAlertsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Alert[]>('/api/intelligence/alerts');
  const list = Array.isArray(data) ? data : [];

  async function scan() {
    await apiFetch('/api/intelligence/alerts/scan', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/intelligence/alerts'] });
  }

  async function dismissBulk() {
    await apiFetch('/api/intelligence/alerts/infra/dismiss-bulk', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/intelligence/alerts'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل التنبيهات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات النظام' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListHeaderComponent={(
          <View style={{ flexDirection: 'row-reverse', gap: 10, padding: 12 }}>
            <GButton title="مسح الآن" variant="primary" size="sm" onPress={scan} />
            <GButton title="إغلاق الكل" variant="secondary" size="sm" onPress={dismissBulk} />
          </View>
        )}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد تنبيهات" description="النظام يعمل بشكل طبيعي" />}
        renderItem={({ item }) => {
          const color = SEVERITY_COLOR[item.severity?.toLowerCase() ?? ''] ?? '#94A3B8';
          const icon = SEVERITY_ICON[item.severity?.toLowerCase() ?? ''] ?? 'information-circle';
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border, opacity: item.dismissed ? 0.5 : 1 }]}>
              <Ionicons name={icon as never} size={22} color={color} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                {item.message ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }} numberOfLines={2}>{item.message}</Text>
                ) : null}
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                  {item.source ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.source}</Text> : null}
                  {item.createdAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.createdAt)}</Text> : null}
                </View>
              </View>
              <View style={{ width: 4, height: '100%', backgroundColor: color, borderRadius: 2, alignSelf: 'stretch' }} />
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
