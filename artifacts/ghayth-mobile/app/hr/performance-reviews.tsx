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

interface PerformanceReview {
  id: number;
  employeeName?: string;
  department?: string;
  period?: string;
  overallScore?: number;
  rating?: string;
  reviewedBy?: string;
  status?: string;
  submittedAt?: string;
}

function scoreColor(score?: number): string {
  if (!score) return '#94A3B8';
  if (score >= 90) return '#22C55E';
  if (score >= 70) return '#3B82F6';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

export default function PerformanceReviewsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PerformanceReview[]>('/api/hr/evaluations');
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
          const color = scoreColor(item.overallScore);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/hr/evaluation-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 12 }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color }}>{item.overallScore ?? '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                  <GStatusBadge status={item.status ?? ''} />
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 2 }}>
                  {item.department ? <Text style={{ fontSize: 12, color: c.brand }}>{item.department}</Text> : null}
                  {item.period ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.period}</Text> : null}
                </View>
                {item.rating ? <Text style={{ fontSize: 12, color, textAlign: 'right' }}>{item.rating}</Text> : null}
                {item.reviewedBy ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>المقيِّم: {item.reviewedBy}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
