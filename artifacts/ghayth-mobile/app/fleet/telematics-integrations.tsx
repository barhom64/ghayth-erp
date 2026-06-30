import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TelematicsIntegration {
  id?: number;
  provider?: string;
  status?: string;
  vehicleCount?: number;
  lastSync?: string;
}

export default function FleetTelematicsIntegrationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TelematicsIntegration[]>('/api/telematics/integrations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تكاملات التتبع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكاملات التتبع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="link-outline" title="لا توجد تكاملات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.provider ?? '—'}</Text>
              {item.vehicleCount != null ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.vehicleCount} مركبة</Text> : null}
              {item.lastSync ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>آخر مزامنة: {new Date(item.lastSync).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text> : null}
            </View>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.status === 'active' ? '#22C55E' : '#EF4444' }} />
          </View>
        )}
      />
    </View>
  );
}
