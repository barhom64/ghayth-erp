import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AgentBalance { id?: number; agentName?: string; balance?: number; currency?: string; }

export default function UmrahAgentBalancesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AgentBalance[]>('/api/umrah/reports/agent-balances');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أرصدة الوكلاء' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد أرصدة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.agentName ?? ''}</Text>
            {item.balance != null ? <Text style={{ color: item.balance >= 0 ? '#38a169' : '#e53e3e', fontSize: 15, fontWeight: '600', marginTop: 4 }}>{item.balance.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
