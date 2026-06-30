import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AgentBalance {
  agentId?: number;
  agentName?: string;
  totalInvoiced?: number;
  totalPaid?: number;
  balance?: number;
  currency?: string;
}

export default function AgentBalancesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AgentBalance[]>('/api/reports/agent-balances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أرصدة الوكلاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أرصدة وكلاء العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.agentId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد أرصدة وكلاء" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 6 }}>{item.agentName ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.totalInvoiced != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>المُفوَّتر</Text>
                <Text style={{ fontSize: 12, color: c.text }}>{item.totalInvoiced.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.totalPaid != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>المدفوع</Text>
                <Text style={{ fontSize: 12, color: '#22C55E' }}>{item.totalPaid.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.balance != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>الرصيد</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: (item.balance ?? 0) < 0 ? '#EF4444' : c.brand }}>{item.balance.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>
              </View> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
