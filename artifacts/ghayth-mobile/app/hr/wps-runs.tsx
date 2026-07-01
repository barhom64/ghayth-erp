import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsRun {
  id?: number;
  period?: string;
  employeeCount?: number;
  totalAmount?: number;
  status?: string;
  submittedAt?: string;
}

export default function HrWpsRunsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WpsRun[]>('/api/hr/wps/runs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تشغيلات WPS…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تشغيلات WPS' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد تشغيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.period ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.totalAmount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.totalAmount.toLocaleString('ar-SA')} ر.س</Text> : null}
            {item.employeeCount != null ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.employeeCount} موظف</Text> : null}
            {item.submittedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.submittedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
