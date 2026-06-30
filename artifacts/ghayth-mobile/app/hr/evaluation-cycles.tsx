/**
 * دورات التقييم
 * GET /api/hr/evaluation-cycles
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EvaluationCycle {
  id: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  participantCount?: number;
  completedCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function EvaluationCyclesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EvaluationCycle[]>('/api/hr/evaluation-cycles');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دورات التقييم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دورات التقييم' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا توجد دورات تقييم" description="" />}
        renderItem={({ item }) => {
          const pct = item.participantCount ? Math.round(((item.completedCount ?? 0) / item.participantCount) * 100) : 0;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 4 }}>
                <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: '#22C55E', borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.participantCount != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.completedCount ?? 0}/{item.participantCount}</Text> : null}
                {item.startDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.startDate)} — {fmtDate(item.endDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
