import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IqamaItem { employeeId?: number; name?: string; iqamaExpiry?: string; daysLeft?: number; }

export default function GovExpiringIqama() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IqamaItem[]>('/api/gov-integrations/expiring/iqama');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إقامات منتهية الصلاحية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="card-outline" title="لا توجد إقامات منتهية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.employeeId ?? '')}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.daysLeft != null ? `${item.daysLeft} يوم` : item.iqamaExpiry ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
