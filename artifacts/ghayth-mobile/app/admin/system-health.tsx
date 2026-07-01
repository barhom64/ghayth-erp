import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HealthStatus { status?: string; version?: string; timestamp?: string; checks?: Record<string, unknown>; }

export default function SystemHealthScreen() {
  const c = useColors();
  const { data: health, isLoading: l1, refetch: r1 } = useList<HealthStatus>('/api/healthz');
  const { data: version, isLoading: l2 } = useList<HealthStatus>('/api/version');
  const { data: live } = useList<HealthStatus>('/api/livez');
  const { data: ready } = useList<HealthStatus>('/api/readyz');
  const h = (health && !Array.isArray(health)) ? health as HealthStatus : null;
  const v = (version && !Array.isArray(version)) ? version as HealthStatus : null;
  const lv = (live && !Array.isArray(live)) ? live as HealthStatus : null;
  const rd = (ready && !Array.isArray(ready)) ? ready as HealthStatus : null;
  if (l1 || l2) return <GLoadingState text="جارٍ الفحص…" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صحة النظام' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <GButton title="تحديث" onPress={r1} variant="secondary" />
        {[{ label: 'الحالة العامة', data: h }, { label: 'الإصدار', data: v }, { label: 'حي', data: lv }, { label: 'جاهز', data: rd }].map(({ label, data: d }) => d && (
          <View key={label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginTop: 12 }}>
            <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
            {Object.entries(d).map(([k, val]) => (
              <Text key={k} style={{ color: c.text, fontSize: 13 }}>{k}: {String(val ?? '')}</Text>
            ))}
          </View>
        ))}
        {!h && <GEmptyState icon="pulse-outline" title="لا توجد بيانات صحة" description="" />}
      </ScrollView>
    </View>
  );
}
