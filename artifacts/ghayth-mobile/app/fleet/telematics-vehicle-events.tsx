import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TelematicsEvent {
  id?: number;
  eventType?: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  speed?: number;
  severity?: string;
}

export default function TelematicsVehicleEventsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TelematicsEvent[]>('/api/fleet/telematics/vehicles/0/events');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أحداث المركبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const severityColor = (s?: string) => {
    if (!s) return c.textMuted;
    if (s === 'high') return '#EF4444';
    if (s === 'medium') return '#F59E0B';
    return '#22C55E';
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أحداث المركبة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="alert-outline" title="لا توجد أحداث" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.eventType ?? '—'}</Text>
              {item.severity ? (
                <Text style={{ fontSize: 12, color: severityColor(item.severity), fontWeight: '600' }}>{item.severity}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.timestamp ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>
                  {new Date(item.timestamp).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
              {item.speed != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>السرعة: {item.speed} كم/س</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
