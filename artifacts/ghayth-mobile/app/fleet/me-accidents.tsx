import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Accident {
  id?: number;
  description?: string;
  status?: string;
  accidentAt?: string;
  location?: string;
  vehiclePlate?: string;
  severity?: string;
  estimatedDamage?: number;
}

export default function MeAccidentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Accident[]>('/api/fleet/me/accidents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بلاغات الحوادث…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const sevColor = (s?: string) => s === 'major' ? '#EF4444' : s === 'minor' ? '#F59E0B' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حوادثي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد حوادث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.description ?? '—'}
              </Text>
              {item.severity ? (
                <View style={{ backgroundColor: sevColor(item.severity), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>{item.severity}</Text>
                </View>
              ) : null}
            </View>
            {item.vehiclePlate ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vehiclePlate}</Text>
            ) : null}
            {item.estimatedDamage != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                الأضرار: {Number(item.estimatedDamage).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
            {item.accidentAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.accidentAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
