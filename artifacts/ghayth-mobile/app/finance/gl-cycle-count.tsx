import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CycleCountPending {
  id?: number;
  warehouseId?: number;
  scheduledDate?: string;
  approvedAt?: string;
  lineCount?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GlCycleCountScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CycleCountPending[]>('/api/gl-helpers/cycle-count/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جرد الدورة المعلّق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جرد دورة — معلّق' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا يوجد جرد معلّق" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#F59E0B', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>مستودع #{item.warehouseId ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.approvedAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>موعد الجرد: {fmtDate(item.scheduledDate)}</Text>
              {item.lineCount != null ? <Text style={{ fontSize: 11, color: c.brand }}>{item.lineCount} سطر</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
