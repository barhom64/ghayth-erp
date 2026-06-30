import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Recommendation {
  id?: number;
  title?: string;
  description?: string;
  impact?: string;
  effort?: string;
  domain?: string;
}

export default function RecommendationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Recommendation[]>('/api/intelligence/recommendations');
  const list = Array.isArray(data) ? data : [];

  const impactColor = (impact?: string) => {
    if (impact === 'high') return '#22C55E';
    if (impact === 'medium') return '#F59E0B';
    return '#EF4444';
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل التوصيات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التوصيات الذكية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد توصيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.title ?? '—'}</Text>
              {item.impact ? (
                <View style={{ backgroundColor: impactColor(item.impact) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: impactColor(item.impact) }}>{item.impact === 'high' ? 'عالي' : item.impact === 'medium' ? 'متوسط' : 'منخفض'}</Text>
                </View>
              ) : null}
            </View>
            {item.description ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.description}</Text> : null}
            {item.domain ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{item.domain}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
