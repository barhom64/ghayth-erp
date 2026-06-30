/**
 * إقفال الفترة المالية
 * GET /api/finance/fiscal-periods
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface FiscalPeriod {
  id: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  closedAt?: string;
  closedBy?: string;
  canClose?: boolean;
  journalCount?: number;
  pendingCount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PeriodCloseScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<FiscalPeriod[]>('/api/finance/fiscal-periods');
  const list = Array.isArray(data) ? data : [];

  async function closePeriod(id: number) {
    await apiFetch(`/api/finance/fiscal-periods/${id}/close`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/finance/fiscal-periods'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفترات المالية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إقفال الفترات المالية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد فترات مالية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: c.textFaint }}>{fmtDate(item.startDate)}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>←</Text>
              <Text style={{ fontSize: 12, color: c.textFaint }}>{fmtDate(item.endDate)}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 8 }}>
              {item.journalCount != null ? (
                <Text style={{ fontSize: 12, color: c.text }}>{item.journalCount} قيد</Text>
              ) : null}
              {item.pendingCount != null && item.pendingCount > 0 ? (
                <Text style={{ fontSize: 12, color: '#F59E0B' }}>{item.pendingCount} معلّق</Text>
              ) : null}
              {item.closedBy ? <Text style={{ fontSize: 11, color: c.textMuted }}>أُقفل بواسطة: {item.closedBy}</Text> : null}
            </View>
            {item.canClose && item.status !== 'closed' ? (
              <GButton title="إقفال الفترة" variant="primary" size="sm" onPress={() => closePeriod(item.id)} />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
