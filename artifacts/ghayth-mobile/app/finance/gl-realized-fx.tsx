import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RealizedFxItem {
  id?: number;
  invoiceId?: number;
  paymentDate?: string;
  settlementRate?: string;
  journalEntryId?: number;
  gainLoss?: string;
  postedAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GlRealizedFxScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RealizedFxItem[]>('/api/gl-helpers/realized-fx/history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل FX المحقَّق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'FX محقَّق — السجل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد قيود FX محقَّقة" description="" />}
        renderItem={({ item }) => {
          const gl = parseFloat(item.gainLoss ?? '0');
          const glColor = gl >= 0 ? '#22C55E' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>فاتورة #{item.invoiceId ?? '—'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: glColor }}>{gl >= 0 ? '+' : ''}{gl.toLocaleString('ar-SA')}</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>سعر التسوية: {item.settlementRate ?? '—'}</Text>
                <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.paymentDate)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
