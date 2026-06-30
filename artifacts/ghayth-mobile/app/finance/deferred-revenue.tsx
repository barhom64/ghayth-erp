/**
 * الإيراد المؤجّل — جداول الاعتراف
 * GET /api/finance/deferred-revenue/schedules
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { statusBadge } from '@/lib/moduleSections';
import { Alert } from 'react-native';

interface DeferredSchedule {
  id: number;
  description?: string;
  totalAmount?: number;
  recognizedAmount?: number;
  remainingAmount?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  sourceType?: string;
  sourceRef?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (!val && val !== 0) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function DeferredRevenueScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<DeferredSchedule[]>('/api/finance/deferred-revenue/schedules');
  const schedules = Array.isArray(data) ? data : [];

  const handleRun = async () => {
    Alert.alert('ترحيل الإيراد المؤجّل', 'سيتم ترحيل كل الأشهر المستحقة حتى اليوم. هل تريد المتابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'ترحيل', onPress: async () => {
          try {
            await apiFetch('/api/finance/deferred-revenue/run', { method: 'POST', body: JSON.stringify({}) });
            await qc.invalidateQueries({ queryKey: ['/api/finance/deferred-revenue/schedules'] });
            Alert.alert('تم', 'تم ترحيل الإيراد المؤجّل بنجاح');
          } catch {
            Alert.alert('خطأ', 'تعذّر الترحيل');
          }
        }
      },
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل جداول الإيراد المؤجّل…" />;
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
      <Stack.Screen options={{ title: 'الإيراد المؤجّل' }} />
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
        <GButton title="ترحيل الأشهر المستحقة" onPress={handleRun} variant="secondary" />
      </View>
      <FlatList
        data={schedules}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="calendar-outline" title="لا توجد جداول" description="لا توجد جداول إيراد مؤجّل مسجّلة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const pct = item.totalAmount && item.totalAmount > 0
            ? Math.round(((item.recognizedAmount ?? 0) / item.totalAmount) * 100)
            : 0;
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }} numberOfLines={1}>
                  {item.description ?? `#${item.id}`}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {fmtDate(item.startDate)} — {fmtDate(item.endDate)}
                </Text>
                <View style={[styles.progressBar, { backgroundColor: c.border, marginTop: 6 }]}>
                  <View style={[styles.progressFill, { width: `${pct}%` as never, backgroundColor: c.brand }]} />
                </View>
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                  {fmtMoney(item.recognizedAmount, item.currency)} / {fmtMoney(item.totalAmount, item.currency)} ({pct}%)
                </Text>
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
