import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GapItem { id?: number; description?: string; amount?: number; journalId?: number; period?: string; }

export default function GlIntegrityGapsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GapItem[]>('/api/finance/reports/gl-integrity-gaps');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فجوات سلامة الدفتر' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فجوات" description="الدفتر سليم" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: '#e53e3e', fontSize: 14 }}>{item.description ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.amount != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text> : null}
              {item.period ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.period}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
