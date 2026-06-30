import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScoringRank {
  rank?: number;
  employeeName?: string;
  department?: string;
  score?: number;
  grade?: string;
}

export default function OrgScoringRankingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScoringRank[]>('/api/org/scoring-ranking');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ترتيب التقييم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ترتيب التقييم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.rank ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="podium-outline" title="لا يوجد ترتيب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: item.rank === 1 ? '#F59E0B' : item.rank === 2 ? '#9CA3AF' : item.rank === 3 ? '#B45309' : c.textMuted }}>
                #{item.rank}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.department}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.score != null ? <Text style={{ fontSize: 16, fontWeight: '700', color: c.brand }}>{item.score}</Text> : null}
              {item.grade ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.grade}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
