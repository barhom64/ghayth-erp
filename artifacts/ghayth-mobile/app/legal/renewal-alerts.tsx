import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RenewalAlert {
  id?: number;
  contractTitle?: string;
  partyName?: string;
  expiresAt?: string;
  daysLeft?: number;
  value?: number;
  currency?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function RenewalAlertsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RenewalAlert[]>('/api/legal/contracts/renewal-alerts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تنبيهات تجديد العقود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات تجديد العقود' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد تنبيهات تجديد" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 30;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: urgent ? '#EF4444' : '#F59E0B', padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.contractTitle ?? '—'}</Text>
                {item.daysLeft != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: urgent ? '#EF4444' : '#F59E0B' }}>{item.daysLeft} يوم</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.partyName ? <Text style={{ fontSize: 11, color: c.brand }}>{item.partyName}</Text> : null}
                {item.value != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.value.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textFaint }}>ينتهي: {fmtDate(item.expiresAt)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
