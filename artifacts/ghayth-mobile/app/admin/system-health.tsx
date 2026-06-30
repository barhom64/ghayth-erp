/**
 * صحة النظام
 * GET /api/admin/system-health
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface HealthStatus {
  status?: string;
  uptime?: number;
  version?: string;
  services?: Array<{
    name?: string;
    status?: string;
    responseTimeMs?: number;
    message?: string;
  }>;
  database?: { status?: string; latencyMs?: number; connections?: number };
  memory?: { heapUsedMb?: number; heapTotalMb?: number; rss?: number };
  queue?: { pending?: number; processing?: number; failed?: number };
}

const STATUS_COLOR: Record<string, string> = {
  ok: '#22C55E',
  healthy: '#22C55E',
  degraded: '#F59E0B',
  down: '#EF4444',
  error: '#EF4444',
};

function StatusDot({ status }: { status?: string }) {
  const color = STATUS_COLOR[status?.toLowerCase() ?? ''] ?? '#94A3B8';
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

export default function SystemHealthScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<HealthStatus>('/api/admin/system-health');
  const { refreshing, onRefresh } = useRefresh([['/api/admin/system-health']]);

  const health = Array.isArray(data) ? data[0] : data as HealthStatus | null;

  if (isLoading) return <GLoadingState text="جارٍ فحص صحة النظام…" />;
  if (isError || !health) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة"
      onAction={onRefresh}
    />
  );

  const services = Array.isArray(health.services) ? health.services : [];
  const overallColor = STATUS_COLOR[health.status?.toLowerCase() ?? ''] ?? '#94A3B8';
  const uptimeHours = health.uptime ? Math.floor(health.uptime / 3600) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صحة النظام' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Ionicons name="pulse-outline" size={22} color={overallColor} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: overallColor }}>
              {health.status === 'ok' || health.status === 'healthy' ? 'النظام يعمل بشكل طبيعي' : 'يوجد مشكلة في النظام'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
            {health.version ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{health.version}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الإصدار</Text>
              </View>
            ) : null}
            {uptimeHours != null ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{uptimeHours} س</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>وقت التشغيل</Text>
              </View>
            ) : null}
          </View>
        </GCard>

        {health.database ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>قاعدة البيانات</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 16, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                <StatusDot status={health.database.status} />
                <Text style={{ fontSize: 13, color: c.text }}>{health.database.status ?? '—'}</Text>
              </View>
              {health.database.latencyMs != null && (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{health.database.latencyMs} ms</Text>
              )}
              {health.database.connections != null && (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{health.database.connections} اتصال</Text>
              )}
            </View>
          </GCard>
        ) : null}

        {health.memory ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الذاكرة</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
              {health.memory.heapUsedMb != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.brand }}>{Math.round(health.memory.heapUsedMb)} MB</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>مُستخدم</Text>
                </View>
              )}
              {health.memory.heapTotalMb != null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{Math.round(health.memory.heapTotalMb)} MB</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي</Text>
                </View>
              )}
            </View>
          </GCard>
        ) : null}

        {health.queue ? (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>قائمة الانتظار</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#F59E0B' }}>{health.queue.pending ?? 0}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>في الانتظار</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#3B82F6' }}>{health.queue.processing ?? 0}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>جارية</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>{health.queue.failed ?? 0}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>فاشلة</Text>
              </View>
            </View>
          </GCard>
        ) : null}

        {services.length > 0 && (
          <GCard style={{ gap: 0, padding: 0 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>الخدمات</Text>
            </View>
            {services.map((svc: { name?: string; status?: string; responseTimeMs?: number; message?: string }, i: number) => (
              <View
                key={i}
                style={[styles.svcRow, { borderBottomColor: c.border, borderBottomWidth: i === services.length - 1 ? 0 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{svc.name ?? '—'}</Text>
                  {svc.message ? <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{svc.message}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  {svc.responseTimeMs != null && (
                    <Text style={{ fontSize: 11, color: c.textFaint }}>{svc.responseTimeMs} ms</Text>
                  )}
                  <StatusDot status={svc.status} />
                </View>
              </View>
            ))}
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  svcRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
});
