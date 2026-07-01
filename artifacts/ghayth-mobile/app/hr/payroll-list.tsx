import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollItem { id?: number; period?: string; status?: string; totalNet?: number; employeeCount?: number; }

export default function PayrollListScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PayrollItem[]>('/api/hr/payroll');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مسيرات الرواتب' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد مسيرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.period ?? ''}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status ?? ''}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.employeeCount != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.employeeCount} موظف</Text> : null}
              {item.totalNet != null ? <Text style={{ color: c.brand, fontSize: 13 }}>{item.totalNet.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
