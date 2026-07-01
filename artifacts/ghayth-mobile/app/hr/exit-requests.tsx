import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExitRequest { id?: number; employeeName?: string; exitDate?: string; reason?: string; status?: string; }

export default function ExitRequestsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExitRequest[]>('/api/hr/exit');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات الخروج' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="exit-outline" title="لا توجد طلبات خروج" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? String(item.id ?? '')}</Text>
            {!!item.reason && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.reason}</Text>}
            {!!item.exitDate && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{new Date(item.exitDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            {!!item.status && <Text style={{ color: c.textFaint, fontSize: 11, marginTop: 2 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
