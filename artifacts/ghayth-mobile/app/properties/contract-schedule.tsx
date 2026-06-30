import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduleEntry { id?: number; dueDate?: string; amount?: number; status?: string; }

export default function ContractScheduleScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduleEntry[]>('/api/properties/contracts/0/schedule');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول الدفعات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد دفعات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            {item.dueDate && (
              <Text style={{ color: c.text, fontSize: 14 }}>
                {new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
            {item.amount != null && (
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                {item.amount.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
            {item.status && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
