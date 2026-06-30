import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NuskWallet {
  configured?: boolean;
  walletBalance?: number;
  totalDeposits?: number;
  totalObligations?: number;
  totalRefunds?: number;
}

export default function NuskWalletScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NuskWallet>('/api/umrah/nusk-wallet');
  const wallet = (data && !Array.isArray(data)) ? data as NuskWallet : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل محفظة نُسك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!wallet?.configured) return (
    <GEmptyState icon="wallet-outline" title="لم يُهيَّأ مورّد نُسك" description="يرجى تحديد مورّد نُسك في الإعدادات أولًا" />
  );

  const rows: { label: string; value: number; color: string }[] = [
    { label: 'رصيد المحفظة', value: wallet.walletBalance ?? 0, color: c.brand },
    { label: 'إجمالي الإيداعات', value: wallet.totalDeposits ?? 0, color: '#22C55E' },
    { label: 'إجمالي الالتزامات', value: wallet.totalObligations ?? 0, color: '#EF4444' },
    { label: 'إجمالي المستردّات', value: wallet.totalRefunds ?? 0, color: '#F59E0B' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'محفظة نُسك' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {rows.map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12, borderRightWidth: 4, borderRightColor: row.color }}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>{row.label}</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: row.color, textAlign: 'right' }}>
              {row.value.toLocaleString('ar-SA')} ر.س
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
