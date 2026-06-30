import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Position {
  id?: number;
  title?: string;
  department?: string;
  grade?: string;
  headcount?: number;
}

export default function OrgPositionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Position[]>('/api/org/positions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوظائف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الوظائف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد وظائف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title ?? '—'}</Text>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.department}</Text> : null}
              {item.grade ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.grade}</Text> : null}
            </View>
            {item.headcount != null ? (
              <View style={{ backgroundColor: c.bg, borderRadius: 8, padding: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{item.headcount}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted }}>موظف</Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
