import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollLine { id?: number; employeeName?: string; gross?: number; deductions?: number; net?: number; }

export default function PayrollLinesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PayrollLine[]>('/api/hr/payroll/0/lines');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سطور مسيرة الرواتب' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد سطور" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? String(item.id ?? '')}</Text>
            {item.gross != null && (
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                الإجمالي: {item.gross.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
            {item.net != null && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                الصافي: {item.net.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
