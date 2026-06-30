import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmAssignee {
  id?: number;
  name?: string;
  jobTitle?: string;
  openOpportunities?: number;
  totalValue?: number;
  winRate?: number;
}

export default function CrmAssigneesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CrmAssignee[]>('/api/crm/assignees');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مندوبي المبيعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مندوبو المبيعات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-outline" title="لا يوجد مندوبون" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.winRate != null ? (
                <Text style={{ fontSize: 13, fontWeight: '700', color: item.winRate >= 50 ? '#22C55E' : '#F59E0B' }}>
                  {Math.round(item.winRate)}% فوز
                </Text>
              ) : null}
            </View>
            {item.jobTitle ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.jobTitle}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 16, marginTop: 6 }}>
              {item.openOpportunities != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.openOpportunities} فرصة</Text> : null}
              {item.totalValue != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.totalValue.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
