import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrackingPolicy {
  id?: number;
  name?: string;
  trackingType?: string;
  isActive?: boolean;
  radius?: number;
  checkInRequired?: boolean;
}

export default function HrTrackingPoliciesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrackingPolicy[]>('/api/attendance/tracking-policies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسات التتبع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسات تتبع الحضور' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد سياسات تتبع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
                {item.trackingType ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.trackingType}</Text> : null}
                {item.radius != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>نطاق: {item.radius}م</Text> : null}
                {item.checkInRequired ? <Text style={{ fontSize: 11, color: c.brand }}>تسجيل دخول مطلوب</Text> : null}
              </View>
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
          </View>
        )}
      />
    </View>
  );
}
