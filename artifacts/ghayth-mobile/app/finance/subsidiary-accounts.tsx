import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SubsidiaryAccount {
  id?: number;
  entityType?: string;
  entityId?: number;
  entityName?: string;
  accountCode?: string;
  accountName?: string;
  balance?: number;
}

export default function FinanceSubsidiaryAccountsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SubsidiaryAccount[]>('/api/accounting-engine/subsidiary-accounts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحسابات الفرعية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحسابات الفرعية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد حسابات فرعية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.entityName ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.accountCode ?? ''}</Text>
            </View>
            {item.entityType ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>{item.entityType}</Text> : null}
            {item.balance != null ? (
              <Text style={{ fontSize: 12, color: (item.balance) >= 0 ? '#22C55E' : '#EF4444', marginTop: 4, textAlign: 'right' }}>
                {item.balance.toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
