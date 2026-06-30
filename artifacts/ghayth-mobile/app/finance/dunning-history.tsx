import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DunningRecord {
  id: number;
  clientName?: string;
  invoiceNumber?: string;
  amount?: number;
  currency?: string;
  dunningLevel?: number;
  sentAt?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function DunningHistoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DunningRecord[]>('/api/dunning/history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل التحصيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل التحصيل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا يوجد سجل تحصيل" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.clientName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.invoiceNumber ? <Text style={{ fontSize: 12, color: c.brand }}>{item.invoiceNumber}</Text> : null}
              {item.dunningLevel != null ? <Text style={{ fontSize: 12, color: '#EF4444' }}>مستوى {item.dunningLevel}</Text> : null}
              {item.amount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.sentAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.sentAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
