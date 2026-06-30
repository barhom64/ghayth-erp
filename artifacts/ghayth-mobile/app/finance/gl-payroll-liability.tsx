import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollLiabilityItem {
  runId?: number;
  period?: string;
  gosiOutstanding?: string;
  whtOutstanding?: string;
  deductionsOutstanding?: string;
}

export default function GlPayrollLiabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PayrollLiabilityItem[]>('/api/gl-helpers/payroll-liability/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التزامات الرواتب المعلّقة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التزامات رواتب — معلّقة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.runId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد التزامات معلّقة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#F59E0B', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>مسيرة #{item.runId ?? '—'}</Text>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.gosiOutstanding ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>GOSI</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{parseFloat(item.gosiOutstanding).toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.whtOutstanding ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>WHT</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{parseFloat(item.whtOutstanding).toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.deductionsOutstanding ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>استقطاعات</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{parseFloat(item.deductionsOutstanding).toLocaleString('ar-SA')}</Text>
              </View> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
