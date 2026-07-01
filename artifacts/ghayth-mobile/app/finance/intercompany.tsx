import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IntercompanyItem { id?: number; fromCompany?: string; toCompany?: string; amount?: number; currency?: string; status?: string; }

export default function IntercompanyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IntercompanyItem[]>('/api/finance/intercompany');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المعاملات بين الشركات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد معاملات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.fromCompany ?? ''} → {item.toCompany ?? ''}</Text>
            {item.amount != null && <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600', marginTop: 4 }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>}
            {!!item.status && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
