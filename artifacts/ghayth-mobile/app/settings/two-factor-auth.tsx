import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TwoFaStatus {
  enabled?: boolean;
  backupCodesRemaining?: number;
  method?: string;
}

export default function TwoFactorAuthScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<TwoFaStatus>('/api/auth/2fa/status');
  const d = (data && !Array.isArray(data)) ? data as TwoFaStatus : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل حالة المصادقة الثنائية…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المصادقة الثنائية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ fontSize: 14, color: c.text }}>الحالة</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: d?.enabled ? '#22C55E' : '#EF4444' }}>
              {d?.enabled ? 'مفعّلة' : 'غير مفعّلة'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ fontSize: 14, color: c.text }}>الطريقة</Text>
            <Text style={{ fontSize: 14, color: c.textMuted }}>{d?.method ?? '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: c.text }}>رموز الاحتياط المتبقية</Text>
            <Text style={{ fontSize: 14, color: (d?.backupCodesRemaining ?? 0) > 0 ? c.brand : '#EF4444', fontWeight: '600' }}>
              {d?.backupCodesRemaining ?? 0}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
