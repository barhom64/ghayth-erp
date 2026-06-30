import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CriticalObligation {
  id?: number;
  title?: string;
  type?: string;
  dueDate?: string;
  amount?: number;
  status?: string;
}

export default function ExecCriticalObligationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CriticalObligation[]>('/api/exec-dashboard/critical-obligations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الالتزامات الحرجة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الالتزامات الحرجة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-done-outline" title="لا التزامات حرجة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.type ? <Text style={{ fontSize: 12, color: c.brand }}>{item.type}</Text> : null}
            {item.amount != null ? (
              <Text style={{ fontSize: 13, color: '#EF4444', marginTop: 2 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>
            ) : null}
            {item.dueDate ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                الاستحقاق: {new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
