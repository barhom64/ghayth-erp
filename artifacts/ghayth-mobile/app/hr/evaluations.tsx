/**
 * تقييمات الأداء
 * GET /api/hr/evaluations
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HrEvaluation {
  id: number;
  employeeName?: string;
  evaluatorName?: string;
  period?: string;
  score?: number;
  maxScore?: number;
  evaluationType?: string;
  status?: string;
}

export default function HrEvaluationsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<HrEvaluation[]>('/api/hr/evaluations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقييمات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقييمات الأداء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا توجد تقييمات" description="" />}
        renderItem={({ item }) => {
          const pct = item.maxScore && item.maxScore > 0 ? Math.min(100, Math.round(((item.score ?? 0) / item.maxScore) * 100)) : 0;
          const scoreColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/hr/evaluation-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.evaluationType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.evaluationType}</Text> : null}
                {item.period ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.period}</Text> : null}
                {item.score != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: scoreColor }}>{item.score}/{item.maxScore ?? 100}</Text> : null}
              </View>
              {item.score != null && item.maxScore ? (
                <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: scoreColor, borderRadius: 2 }} />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
