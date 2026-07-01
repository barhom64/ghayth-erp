import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MissingTaxEntry {
  id?: number;
  entityType?: string;
  entityName?: string;
  entityId?: number;
  missingField?: string;
}

export default function FinanceZatcaMissingTaxScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MissingTaxEntry[]>('/api/finance/zatca/missing-tax-numbers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أرقام الضريبة الناقصة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أرقام ضريبية ناقصة ZATCA' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد أرقام ناقصة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.entityName ?? '—'}</Text>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.entityType}</Text> : null}
              {item.missingField ? <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>{item.missingField}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
