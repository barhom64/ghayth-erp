import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SubsidiaryAccount { id?: number; entityType?: string; entityId?: number; accountCode?: string; balance?: number; }

export default function SubsidiaryAccountsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SubsidiaryAccount[]>('/api/finance/subsidiary-accounts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحسابات الفرعية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد حسابات فرعية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.accountCode ?? String(item.id ?? '')}</Text>
              {!!item.entityType && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.entityType}</Text>}
            </View>
            {item.balance != null && <Text style={{ color: item.balance >= 0 ? c.brand : '#ef4444', fontSize: 14, fontWeight: '600' }}>{item.balance.toLocaleString('ar-SA')}</Text>}
          </View>
        )}
      />
    </View>
  );
}
