/**
 * ربط مراكز التكلفة
 * GET /api/finance/cost-center-assignments
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterAssignment {
  id: number;
  entityType?: string;
  entityName?: string;
  costCenterName?: string;
  allocationPercent?: number;
  effectiveDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CostCenterAssignmentsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<CostCenterAssignment[]>('/api/finance/cost-center-assignments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ربط مراكز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربط مراكز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا يوجد ربط" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/cost-center-assignment-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.entityName ?? '—'}</Text>
              {item.allocationPercent != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.allocationPercent}%</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.entityType}</Text> : null}
              {item.costCenterName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.costCenterName}</Text> : null}
            </View>
            {item.effectiveDate ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{fmtDate(item.effectiveDate)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
