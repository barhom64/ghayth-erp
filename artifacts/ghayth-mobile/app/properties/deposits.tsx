import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SecurityDeposit {
  id?: number;
  tenantName?: string;
  unitNumber?: string;
  buildingName?: string;
  amount?: number;
  status?: string;
  receivedDate?: string;
}

export default function DepositsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SecurityDeposit[]>('/api/properties/deposits');
  const list = Array.isArray(data) ? (data as unknown as { data: SecurityDeposit[] })?.data ?? (data as SecurityDeposit[]) : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التأمينات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تأمينات الإيجار' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد تأمينات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.tenantName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.unitNumber ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.unitNumber}</Text> : null}
              {item.buildingName ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.buildingName}</Text> : null}
            </View>
            {item.amount != null ? (
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand, marginTop: 4 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
