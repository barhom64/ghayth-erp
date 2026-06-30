import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollSummaryEmployee {
  employeeId?: number;
  employeeName?: string;
  empNumber?: string;
  totalBasic?: number;
  totalGross?: number;
  totalNet?: number;
  totalGosi?: number;
}

interface PayrollSummaryResponse {
  data?: PayrollSummaryEmployee[];
  total?: number;
  period?: string;
  [key: string]: unknown;
}

export default function PayrollSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PayrollSummaryResponse>('/api/hr/payroll-summary');
  const resp = (data && !Array.isArray(data)) ? data as PayrollSummaryResponse : null;
  const list = resp?.data ?? (Array.isArray(data) ? data as PayrollSummaryEmployee[] : []);

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص الرواتب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const totalNet = list.reduce((sum, e) => sum + (e.totalNet ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص الرواتب' }} />
      {resp?.period ? (
        <View style={{ backgroundColor: c.surface, padding: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>الفترة: {resp.period}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>الصافي: {totalNet.toLocaleString('ar-SA')} ر.س</Text>
        </View>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا يوجد ملخص رواتب" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E' }}>{(item.totalNet ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.empNumber ? <Text style={{ fontSize: 11, color: c.brand }}>{item.empNumber}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textMuted }}>إجمالي: {(item.totalGross ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textFaint }}>GOSI: {(item.totalGosi ?? 0).toLocaleString('ar-SA')}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
