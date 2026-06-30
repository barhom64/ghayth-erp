import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BankGuarantee {
  id: number;
  guaranteeNumber?: string;
  beneficiary?: string;
  amount?: number;
  currency?: string;
  status?: string;
  expiryDate?: string;
  daysLeft?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function BankGuaranteesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BankGuarantee[]>('/api/bank-guarantees');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطابات الضمان…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطابات الضمان' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد خطابات ضمان" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 30;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: urgent ? 3 : 0, borderRightColor: '#EF4444', padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.guaranteeNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.guaranteeNumber}</Text> : null}
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.beneficiary ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {item.daysLeft != null ? <Text style={{ fontSize: 11, color: urgent ? '#EF4444' : c.textFaint }}>{item.daysLeft} يوم</Text> : null}
                {item.expiryDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.expiryDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
