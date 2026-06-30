/**
 * خطط التطوير الفردية
 * GET /api/hr/idp
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IdpPlan {
  id: number;
  employeeName?: string;
  goalTitle?: string;
  targetDate?: string;
  progressPercent?: number;
  status?: string;
  competencyArea?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function IdpScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IdpPlan[]>('/api/hr/idp');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطط التطوير…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطط التطوير الفردية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد خطط تطوير" description="" />}
        renderItem={({ item }) => {
          const pct = item.progressPercent ?? 0;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand, textAlign: 'right', marginBottom: 6 }}>{item.goalTitle ?? '—'}</Text>
              <View style={{ height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 4 }}>
                <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: pct >= 75 ? '#22C55E' : '#3B82F6', borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.competencyArea ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.competencyArea}</Text> : null}
                {item.targetDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>الهدف: {fmtDate(item.targetDate)}</Text> : null}
                <Text style={{ fontSize: 12, color: c.brand }}>{pct}%</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
