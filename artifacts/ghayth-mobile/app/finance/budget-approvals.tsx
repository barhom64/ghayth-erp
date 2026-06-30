import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BudgetApprovalRequest {
  id?: number;
  budgetName?: string;
  requestedBy?: string;
  amount?: number;
  currency?: string;
  status?: string;
  submittedAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function BudgetApprovalsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BudgetApprovalRequest[]>('/api/budget/approval-requests');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلبات اعتماد الميزانية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات اعتماد الميزانية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا توجد طلبات اعتماد" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.budgetName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.amount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.requestedBy ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.requestedBy}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.submittedAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
