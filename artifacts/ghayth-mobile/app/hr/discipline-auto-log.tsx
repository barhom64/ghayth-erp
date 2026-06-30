import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AutoDetectionLog {
  id?: number;
  employeeName?: string;
  detectedAt?: string;
  violationType?: string;
  action?: string;
  status?: string;
}

export default function HrDisciplineAutoLogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AutoDetectionLog[]>('/api/hr/discipline/auto-detection/log');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل الكشف التلقائي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل الكشف التلقائي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد سجلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.violationType ? <Text style={{ fontSize: 12, color: '#EF4444' }}>{item.violationType}</Text> : null}
            {item.action ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.action}</Text> : null}
            {item.detectedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.detectedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
