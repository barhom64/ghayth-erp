import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Suggestion {
  id?: number;
  title?: string;
  description?: string;
  priority?: string;
  domain?: string;
  score?: number;
}

export default function SuggestionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Suggestion[]>('/api/intelligence/suggestions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الاقتراحات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الاقتراحات الذكية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bulb-outline" title="لا توجد اقتراحات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.title ?? '—'}</Text>
              {item.score != null ? <Text style={{ fontSize: 12, color: c.brand, marginStart: 8 }}>{item.score}%</Text> : null}
            </View>
            {item.description ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.description}</Text> : null}
            {item.domain ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{item.domain}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
