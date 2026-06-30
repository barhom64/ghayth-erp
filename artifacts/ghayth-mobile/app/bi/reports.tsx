/**
 * التقارير التحليلية
 * GET /api/bi/reports
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface Report {
  id: number;
  name?: string;
  title?: string;
  category?: string;
  description?: string;
  lastRun?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return 'لم يُشغَّل بعد';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const CATEGORY_ICON: Record<string, string> = {
  finance: 'cash-outline',
  hr: 'people-outline',
  fleet: 'car-outline',
  warehouse: 'cube-outline',
  properties: 'home-outline',
  projects: 'folder-outline',
  crm: 'person-outline',
};

export default function BiReportsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Report[]>('/api/bi/reports');
  const list = Array.isArray(data) ? data : [];

  async function runReport(id: number) {
    await apiFetch(`/api/bi/kpis/${id}/refresh`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/bi/reports'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقارير…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التقارير التحليلية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد تقارير" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c.brand + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={(CATEGORY_ICON[item.category ?? ''] ?? 'analytics-outline') as never} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.title ?? item.name ?? '—'}
                </Text>
                {item.category ? <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
              </View>
            </View>
            {item.description ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 8 }} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: c.textFaint }}>آخر تشغيل: {fmtDate(item.lastRun)}</Text>
            </View>
          </GCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
});
