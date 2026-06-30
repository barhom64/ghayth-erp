import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CriticalObligation {
  id?: number;
  title?: string;
  entityName?: string;
  dueDate?: string;
  amount?: number;
  daysUntilDue?: number;
  type?: string;
}

export default function CriticalObligationsScreen() {
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
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد التزامات حرجة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.title ?? '—'}
              </Text>
              {item.daysUntilDue != null ? (
                <Text style={{ fontSize: 12, color: item.daysUntilDue <= 7 ? '#EF4444' : '#F59E0B', fontWeight: '600' }}>
                  {item.daysUntilDue} يوم
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
              {item.entityName ?? '—'} {item.type ? `• ${item.type}` : ''}
            </Text>
            {item.amount != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                {Number(item.amount).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
