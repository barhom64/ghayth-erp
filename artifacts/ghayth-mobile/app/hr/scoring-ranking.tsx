import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScoringRank {
  rank?: number;
  employeeId?: number;
  employeeName?: string;
  totalScore?: number;
  performanceScore?: number;
  attendanceScore?: number;
}

export default function ScoringRankingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScoringRank[]>('/api/org/scoring-ranking');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تصنيف الأداء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تصنيف الأداء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="podium-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            {item.rank != null ? (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: item.rank <= 3 ? '#F59E0B' : c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: item.rank <= 3 ? '#fff' : c.textMuted }}>#{item.rank}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 2 }}>
                {item.performanceScore != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>أداء: {item.performanceScore}</Text> : null}
                {item.attendanceScore != null ? <Text style={{ fontSize: 11, color: c.brand }}>حضور: {item.attendanceScore}</Text> : null}
              </View>
            </View>
            {item.totalScore != null ? <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.totalScore}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
