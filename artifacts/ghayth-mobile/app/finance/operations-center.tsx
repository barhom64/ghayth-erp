/**
 * مركز العمليات — لوحة اليومية المالية والتشغيلية
 * GET /api/operations-center
 */
import React from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';

interface OpsData {
  pendingVouchers?: number;
  unpostedJournals?: number;
  overdueInvoices?: number;
  openTickets?: number;
  blockers?: Array<{ key: string; label: string; severity: 'ok' | 'warning' | 'critical'; value?: number }>;
  dailyCloseChecklist?: Array<{ key: string; label: string; done: boolean }>;
  updatedAt?: string;
}

const SEV_COLOR: Record<string, string> = {
  ok: '#22C55E', warning: '#F59E0B', critical: '#EF4444',
};

export default function OperationsCenterScreen() {
  const c = useColors();
  const [executing, setExecuting] = React.useState(false);
  const { data: ops, isLoading, isError } = useList<OpsData>('/api/operations-center');
  const { refreshing, onRefresh } = useRefresh([['/api/operations-center']]);

  const blockers = ops?.blockers ?? [];
  const checklist = ops?.dailyCloseChecklist ?? [];
  const allDone = checklist.every(item => item.done);

  const doClose = () => {
    Alert.alert('إغلاق يومي', 'هل تريد تنفيذ الإغلاق اليومي؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تنفيذ', style: 'destructive', onPress: async () => {
          setExecuting(true);
          try {
            await apiFetch('/api/operations-center/daily-close/execute', { method: 'POST', body: JSON.stringify({}) });
            Alert.alert('تم', 'تم تنفيذ الإغلاق اليومي بنجاح');
          } catch {
            Alert.alert('خطأ', 'تعذّر تنفيذ الإغلاق اليومي');
          } finally {
            setExecuting(false);
          }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل مركز العمليات…" />;
  if (isError || !ops) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال وأعد المحاولة" />
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'مركز العمليات' }} />

      {/* ملخص سريع */}
      <View style={styles.statsRow}>
        {[
          { label: 'سندات معلقة', value: ops.pendingVouchers ?? 0, icon: 'document-outline', color: '#F59E0B' },
          { label: 'قيود غير مرحّلة', value: ops.unpostedJournals ?? 0, icon: 'book-outline', color: '#3B82F6' },
          { label: 'فواتير متأخرة', value: ops.overdueInvoices ?? 0, icon: 'receipt-outline', color: '#EF4444' },
          { label: 'تذاكر مفتوحة', value: ops.openTickets ?? 0, icon: 'headset-outline', color: '#8B5CF6' },
        ].map(stat => (
          <GCard key={stat.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
            <Ionicons name={stat.icon as never} size={22} color={stat.color} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 4 }}>{stat.value}</Text>
            <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
          </GCard>
        ))}
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* المعوقات */}
        {blockers.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>تنبيهات النظام</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {blockers.map((b, i) => (
                <View key={b.key} style={[styles.blockerRow, { borderBottomColor: c.border }, i === blockers.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.sevDot, { backgroundColor: SEV_COLOR[b.severity] }]} />
                  <Text style={{ flex: 1, fontSize: 14, color: c.text, textAlign: 'right' }}>{b.label}</Text>
                  {b.value !== undefined ? (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: SEV_COLOR[b.severity] }}>{b.value}</Text>
                  ) : null}
                </View>
              ))}
            </GCard>
          </>
        )}

        {/* قائمة الإغلاق اليومي */}
        {checklist.length > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>قائمة الإغلاق اليومي</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {checklist.map((item, i) => (
                <View key={item.key} style={[styles.checkRow, { borderBottomColor: c.border }, i === checklist.length - 1 && { borderBottomWidth: 0 }]}>
                  <Ionicons
                    name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={item.done ? '#22C55E' : c.textFaint}
                  />
                  <Text style={{ flex: 1, fontSize: 13, color: item.done ? c.textMuted : c.text, textAlign: 'right' }}>{item.label}</Text>
                </View>
              ))}
            </GCard>
            <GButton
              title="تنفيذ الإغلاق اليومي"
              onPress={doClose}
              loading={executing}
              variant={allDone ? 'primary' : 'secondary'}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  blockerRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
  sevDot: { width: 10, height: 10, borderRadius: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
