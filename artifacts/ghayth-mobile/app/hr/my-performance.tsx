/**
 * تقييماتي — عرض تقييمات الأداء الشخصية من /api/my-space/performance
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PerfRow {
  id: number;
  period?: string;
  overallRating?: number | null;
  notes?: string | null;
  status: string;
  createdAt: string;
}

interface PerfResp { data?: PerfRow[] }

function formatDate(val: string): string {
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' }); }
  catch { return val; }
}

function RatingBar({ value, c }: { value: number; c: ReturnType<typeof useColors> }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: c.textFaint }}>0</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{pct.toFixed(0)}%</Text>
        <Text style={{ fontSize: 11, color: c.textFaint }}>100</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as never, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

export default function MyPerformanceScreen() {
  const c = useColors();
  const { data: resp, isLoading, isError, refetch } = useList<PerfResp>('/api/my-space/performance');
  const rows = resp?.data ?? [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقييمات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل التقييمات" description="تحقق من اتصالك وحاول مجدداً" actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      data={rows}
      keyExtractor={r => String(r.id)}
      onRefresh={refetch}
      refreshing={isLoading}
      ListHeaderComponent={<Stack.Screen options={{ title: 'تقييماتي' }} />}
      ListEmptyComponent={
        <GEmptyState icon="star-outline" title="لا توجد تقييمات" description="لم يتم إجراء أي تقييم لك بعد" />
      }
      renderItem={({ item }) => {
        const st = statusBadge(item.status);
        return (
          <GCard style={styles.card}>
            <View style={styles.cardHeader}>
              <GStatusBadge status={st?.label ?? item.status} size="sm" />
              <GText variant="label">{item.period ?? formatDate(item.createdAt)}</GText>
            </View>
            {item.overallRating !== null && item.overallRating !== undefined && (
              <RatingBar value={Number(item.overallRating)} c={c} />
            )}
            {item.notes ? (
              <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right', marginTop: 8, lineHeight: 20 }}>
                {item.notes}
              </Text>
            ) : null}
          </GCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10, paddingBottom: 40 },
  card: { gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
