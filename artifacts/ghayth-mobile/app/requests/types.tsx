import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RequestType {
  id?: number;
  name?: string;
  category?: string;
  requiresApproval?: boolean;
  slaHours?: number;
  isActive?: boolean;
}

export default function RequestTypesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RequestType[]>('/api/requests/types');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أنواع الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أنواع الطلبات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد أنواع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.category}</Text> : null}
              {item.slaHours != null ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>SLA: {item.slaHours} ساعة</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {item.requiresApproval ? <Text style={{ fontSize: 10, color: '#F59E0B' }}>يحتاج اعتماد</Text> : null}
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
