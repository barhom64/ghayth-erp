import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UninvoicedGroup {
  id?: number;
  groupName?: string;
  pilgrims?: number;
  departureDate?: string;
  totalValue?: number;
  currency?: string;
}

export default function UmrahUninvoicedGroupsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UninvoicedGroup[]>('/api/umrah/sales-wizard/uninvoiced-groups');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المجموعات غير المفوترة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مجموعات بلا فواتير' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="كل المجموعات مفوترة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.groupName ?? '—'}</Text>
              {item.totalValue != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {item.totalValue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.pilgrims != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.pilgrims} حاج</Text> : null}
              {item.departureDate ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  {new Date(item.departureDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
