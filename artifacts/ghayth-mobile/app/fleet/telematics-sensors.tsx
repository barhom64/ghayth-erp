import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SensorReading {
  sensorType?: string;
  value?: number;
  unit?: string;
  timestamp?: string;
  status?: string;
}

export default function TelematicsSensorsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SensorReading[]>('/api/fleet/telematics/vehicles/0/sensors');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحساسات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيانات الحساسات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.sensorType ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pulse-outline" title="لا توجد بيانات حساسات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.sensorType ?? '—'}</Text>
              <Text style={{ fontSize: 14, color: c.brand, fontWeight: '600' }}>
                {item.value ?? '—'} {item.unit ?? ''}
              </Text>
            </View>
            {item.timestamp ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.timestamp).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
