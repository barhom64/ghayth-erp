import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GlReconciliationItem {
  id?: number | string;
  source?: string;
  period?: string;
  status?: string;
  variance?: number;
  itemCount?: number;
  checkedAt?: string;
}

export default function GlReconciliationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GlReconciliationItem[]>('/api/admin/governance/gl-reconciliation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تسوية الدفتر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسوية دفتر الأستاذ' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="book-outline" title="لا توجد تسويات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.source ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.period ? <Text style={{ fontSize: 11, color: c.brand }}>{item.period}</Text> : null}
              {item.variance != null ? (
                <Text style={{ fontSize: 11, color: item.variance === 0 ? '#22C55E' : '#EF4444' }}>
                  فارق: {item.variance.toLocaleString('ar-SA')}
                </Text>
              ) : null}
              {item.itemCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>بنود: {item.itemCount}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
