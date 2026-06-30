import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TelematicsAlert {
  id?: number;
  vehiclePlate?: string;
  alertType?: string;
  severity?: string;
  description?: string;
  triggeredAt?: string;
}

export default function FleetTelematicsAiAlertsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TelematicsAlert[]>('/api/telematics/ai-alerts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تنبيهات الذكاء الاصطناعي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات AI للتتبع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد تنبيهات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.vehiclePlate ?? '—'}</Text>
              <GStatusBadge status={item.severity ?? 'warning'} />
            </View>
            {item.alertType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.alertType}</Text> : null}
            {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.description}</Text> : null}
            {item.triggeredAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.triggeredAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
