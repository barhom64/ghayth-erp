/**
 * فرص البيع
 * GET /api/crm/opportunities
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmOpportunity {
  id: number;
  title?: string;
  clientName?: string;
  stage?: string;
  expectedValue?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  assignedTo?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CrmOpportunitiesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<CrmOpportunity[]>('/api/crm/opportunities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفرص…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فرص البيع' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد فرص" description="" />}
        renderItem={({ item }) => {
          const probPct = item.probability ?? 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/crm/opportunity-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
                <GStatusBadge status={item.stage ?? item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.clientName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.clientName}</Text> : null}
                {item.expectedValue != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.expectedValue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              </View>
              <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                <View style={{ height: 4, width: `${probPct}%` as never, backgroundColor: '#22C55E', borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                <Text style={{ fontSize: 10, color: c.textFaint }}>احتمالية: {probPct}%</Text>
                {item.expectedCloseDate ? <Text style={{ fontSize: 10, color: c.textFaint }}>{fmtDate(item.expectedCloseDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
