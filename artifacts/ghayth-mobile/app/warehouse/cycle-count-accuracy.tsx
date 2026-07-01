import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CycleAccuracy { id?: number; period?: string; accuracy?: number; counted?: number; total?: number; }

export default function CycleCountAccuracyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CycleAccuracy[]>('/api/warehouse/reports/cycle-count-accuracy');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دقة الجرد الدوري' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.accuracy != null ? <Text style={{ color: c.brand, fontSize: 16, fontWeight: 'bold' }}>{item.accuracy.toFixed(1)}%</Text> : null}
              {item.counted != null && item.total != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.counted}/{item.total}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
