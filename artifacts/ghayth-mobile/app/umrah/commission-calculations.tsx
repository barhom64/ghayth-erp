import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommissionCalc {
  id?: number;
  agentName?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  status?: string;
  period?: string;
  calculatedAt?: string;
}

export default function CommissionCalculationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CommissionCalc[]>('/api/umrah/commission-calculations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل احتساب العمولات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'احتساب العمولات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد احتسابات عمولات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.agentName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.planName ? <Text style={{ fontSize: 11, color: c.brand }}>{item.planName}</Text> : null}
              {item.amount != null ? <Text style={{ fontSize: 11, fontWeight: '700', color: c.text }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
