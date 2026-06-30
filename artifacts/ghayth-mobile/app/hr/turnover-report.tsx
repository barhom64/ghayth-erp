import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TurnoverItem {
  period?: string;
  department?: string;
  hired?: number;
  terminated?: number;
  turnoverRate?: number;
}

export default function TurnoverReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TurnoverItem[]>('/api/turnover-report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الدوران الوظيفي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير الدوران الوظيفي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.period}-${item.department}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات دوران وظيفي" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.department ?? '—'}</Text>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.hired != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>مُعيَّن: {item.hired}</Text> : null}
              {item.terminated != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>مُنهى: {item.terminated}</Text> : null}
              {item.turnoverRate != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>دوران: {(item.turnoverRate * 100).toFixed(1)}%</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
