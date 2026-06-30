import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DriverPortalAccount { driverId?: number; username?: string; status?: string; lastLogin?: string; }

export default function DriverPortal() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DriverPortalAccount>('/api/fleet/drivers/0/portal-account');
  const d = (data && !Array.isArray(data)) ? data as DriverPortalAccount : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حساب بوابة السائق' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[{ label: 'اسم المستخدم', value: d?.username }, { label: 'الحالة', value: d?.status }, { label: 'آخر دخول', value: d?.lastLogin ? new Date(d.lastLogin).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined }].map((row, i) => row.value ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}
