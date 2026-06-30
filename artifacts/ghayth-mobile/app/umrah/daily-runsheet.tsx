import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RunsheetItem {
  id?: number | string;
  groupName?: string;
  activity?: string;
  time?: string;
  location?: string;
  pilgrimsCount?: number;
  guideId?: number;
  guideName?: string;
}

export default function DailyRunsheetScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RunsheetItem[]>('/api/umrah/reports/daily-runsheet');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جدول اليوم…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول تشغيل اليوم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="today-outline" title="لا توجد برامج اليوم" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.groupName ?? '—'}</Text>
              {item.time ? <Text style={{ fontSize: 12, color: c.brand }}>{item.time}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.activity ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.activity}</Text> : null}
              {item.location ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.location}</Text> : null}
              {item.pilgrimsCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>حجاج: {item.pilgrimsCount}</Text> : null}
            </View>
            {item.guideName ? <Text style={{ fontSize: 11, color: c.brand, marginTop: 2 }}>المرشد: {item.guideName}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
