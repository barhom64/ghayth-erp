/**
 * مركز العمليات المالية
 * GET /api/operations-center
 */
import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';
import { useQueryClient } from '@tanstack/react-query';

interface OperationsCenter {
  pendingApprovals?: number;
  overdueInvoices?: number;
  cashBalance?: number;
  alerts?: Array<{ type: string; message: string; severity: string }>;
}

export default function OperationsCenterScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useList<OperationsCenter>('/api/operations-center');
  const { data: checkData } = useList<{ key: string; label: string; done: boolean }[]>('/api/operations-center/daily-close/checklist');
  const { refreshing, onRefresh } = useRefresh([['/api/operations-center']]);
  const ops = Array.isArray(data) ? data[0] : data as OperationsCenter | null;
  const checklist = Array.isArray(checkData) ? checkData : [];

  async function dailyClose() {
    await apiFetch('/api/operations-center/daily-close/execute', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/operations-center/daily-close/checklist'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل مركز العمليات…" />;
  if (isError || !ops) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={onRefresh} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مركز العمليات' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>نظرة عامة</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 20, flexWrap: 'wrap' }}>
            {ops.pendingApprovals != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#F59E0B' }}>{ops.pendingApprovals}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>موافقات معلّقة</Text>
              </View>
            )}
            {ops.overdueInvoices != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#EF4444' }}>{ops.overdueInvoices}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>فواتير متأخرة</Text>
              </View>
            )}
            {ops.cashBalance != null && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#22C55E' }}>{ops.cashBalance.toLocaleString('ar-SA')}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الرصيد النقدي</Text>
              </View>
            )}
          </View>
        </GCard>

        {checklist.length > 0 && (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>قائمة الإغلاق اليومي</Text>
            {checklist.map((item: { key: string; label: string; done: boolean }, i: number) => (
              <View key={item.key} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: i === checklist.length - 1 ? 0 : 8 }}>
                <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={item.done ? '#22C55E' : c.textMuted} />
                <Text style={{ flex: 1, fontSize: 13, color: item.done ? c.textMuted : c.text, textAlign: 'right' }}>{item.label}</Text>
              </View>
            ))}
            <View style={{ marginTop: 14 }}>
              <GButton title="تنفيذ الإغلاق اليومي" variant="primary" onPress={dailyClose} />
            </View>
          </GCard>
        )}

        {Array.isArray(ops.alerts) && ops.alerts.length > 0 && (
          <GCard>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>التنبيهات</Text>
            {(ops.alerts as Array<{ type: string; message: string; severity: string }>).map((alert, i: number) => (
              <View key={i} style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                <Ionicons name={alert.severity === 'error' ? 'alert-circle' : 'warning'} size={16} color={alert.severity === 'error' ? '#EF4444' : '#F59E0B'} />
                <Text style={{ flex: 1, fontSize: 12, color: c.text, textAlign: 'right' }}>{alert.message}</Text>
              </View>
            ))}
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}
