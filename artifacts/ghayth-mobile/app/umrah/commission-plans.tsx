import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommissionPlan { id?: number; name?: string; rate?: number; type?: string; isActive?: boolean; }

export default function UmrahCommissionPlansScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CommissionPlan[]>('/api/umrah/commission-plans');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطط العمولة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد خطط" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? ''}</Text>
              <Text style={{ color: item.isActive ? '#38a169' : c.textMuted, fontSize: 12 }}>{item.isActive ? 'نشط' : 'غير نشط'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.rate != null ? <Text style={{ color: c.brand, fontSize: 13 }}>{item.rate}%</Text> : null}
              {item.type ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.type}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
