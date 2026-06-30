import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ViolationReport {
  id?: number;
  type?: string;
  priority?: string;
  status?: string;
  department?: string;
  description?: string;
  auditDate?: string;
}

interface ViolationsReportResponse {
  violations?: ViolationReport[];
  total?: number;
  [key: string]: unknown;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ViolationsReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ViolationsReportResponse>('/api/admin/violations-report');
  const resp = (data && !Array.isArray(data)) ? data as ViolationsReportResponse : null;
  const list = resp?.violations ?? (Array.isArray(data) ? data as ViolationReport[] : []);

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير المخالفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير المخالفات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد مخالفات" description="" />}
        renderItem={({ item }) => {
          const critical = item.priority === 'critical' || item.priority === 'high';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: critical ? '#EF4444' : '#F59E0B', padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.type ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.department ? <Text style={{ fontSize: 11, color: c.brand }}>{item.department}</Text> : null}
                {item.priority ? <Text style={{ fontSize: 11, color: critical ? '#EF4444' : '#F59E0B' }}>{item.priority}</Text> : null}
                <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.auditDate)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
