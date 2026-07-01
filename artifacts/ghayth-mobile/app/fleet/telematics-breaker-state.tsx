import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BreakerState { state?: string; reason?: string; trippedAt?: string; vehicleCount?: number; }

export default function TelematicsBreakerState() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BreakerState>('/api/fleet/telematics/breaker-state');
  const d = (data && !Array.isArray(data)) ? data as BreakerState : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حالة قاطع الدائرة' }} />
      <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 36 }}>{d.state === 'open' ? '🔴' : '🟢'}</Text>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 8 }}>{d.state === 'open' ? 'مفتوح' : 'مغلق'}</Text>
      </View>
      {!!d.reason && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 8 }}>السبب: {d.reason}</Text>}
      {d.vehicleCount !== undefined && <Text style={{ color: c.textMuted, fontSize: 13 }}>المركبات المتأثرة: {d.vehicleCount}</Text>}
    </ScrollView>
  );
}
