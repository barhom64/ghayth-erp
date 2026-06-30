import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupervisionLine {
  id?: number;
  supervisorName?: string;
  subordinateName?: string;
  department?: string;
  effectiveDate?: string;
}

export default function OrgSupervisionLinesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SupervisionLine[]>('/api/org/supervision-lines');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل خطوط الإشراف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خطوط الإشراف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد خطوط إشراف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{item.supervisorName ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>←</Text>
              <Text style={{ fontSize: 14, color: c.text }}>{item.subordinateName ?? '—'}</Text>
            </View>
            {item.department ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{item.department}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
