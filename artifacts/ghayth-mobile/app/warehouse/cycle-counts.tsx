/**
 * جرد دوري
 * GET /api/warehouse/cycle-counts
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CycleCount {
  id: number;
  reference?: string;
  warehouseName?: string;
  scheduledAt?: string;
  completedAt?: string;
  itemCount?: number;
  varianceCount?: number;
  status?: string;
  conductedBy?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CycleCountsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<CycleCount[]>('/api/warehouse/cycle-counts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الجرد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الجرد الدوري' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد عمليات جرد" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/warehouse/cycle-count-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.reference ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.warehouseName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.warehouseName}</Text> : null}
              {item.conductedBy ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.conductedBy}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text> : null}
              {item.itemCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.itemCount} صنف</Text> : null}
              {item.varianceCount != null && item.varianceCount > 0 ? (
                <Text style={{ fontSize: 11, color: '#EF4444' }}>⚠ {item.varianceCount} فارق</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
