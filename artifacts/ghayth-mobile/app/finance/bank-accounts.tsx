/**
 * الحسابات البنكية
 * GET /api/finance/bank-accounts
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BankAccount {
  id: number;
  accountName?: string;
  bankName?: string;
  iban?: string;
  currency?: string;
  balance?: number;
  accountType?: string;
  status?: string;
}

export default function BankAccountsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<BankAccount[]>('/api/finance/bank-accounts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحسابات البنكية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحسابات البنكية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="card-outline" title="لا توجد حسابات بنكية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/bank-account-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.accountName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.bankName ? <Text style={{ fontSize: 13, color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.bankName}</Text> : null}
            {item.iban ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginBottom: 8 }}>{item.iban}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{item.accountType ?? ''}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: (item.balance ?? 0) >= 0 ? '#22C55E' : '#EF4444' }}>
                {(item.balance ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
