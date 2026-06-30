import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiOverview {
  totalPrompts?: number;
  activeProviders?: number;
  totalEvaluations?: number;
  avgScore?: number;
  pendingReviews?: number;
}

export default function AdminAiOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<AiOverview>('/api/admin/ai-governance/overview');
  const d = (data && !Array.isArray(data)) ? data as AiOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة الذكاء الاصطناعي…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const stats = [
    { label: 'التعليمات', value: d?.totalPrompts ?? 0, color: c.brand },
    { label: 'المزودون النشطون', value: d?.activeProviders ?? 0, color: '#22C55E' },
    { label: 'التقييمات', value: d?.totalEvaluations ?? 0, color: '#8B5CF6' },
    { label: 'بانتظار المراجعة', value: d?.pendingReviews ?? 0, color: '#F59E0B' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة حوكمة الذكاء الاصطناعي' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.avgScore != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: c.brand }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: c.brand }}>{Math.round(d.avgScore)}%</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>متوسط التقييم</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {stats.map(s => (
            <View key={s.label} style={{ flex: 1, minWidth: '44%', backgroundColor: c.surface, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
