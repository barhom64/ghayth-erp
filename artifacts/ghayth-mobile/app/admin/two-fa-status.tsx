import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TwoFAStatus { enabled?: boolean; method?: string; backupCodesRemaining?: number; lastUsed?: string; }

export default function TwoFAStatus() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TwoFAStatus>('/api/auth/2fa/status');
  const d = (data && !Array.isArray(data)) ? data as TwoFAStatus : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حالة المصادقة الثنائية' }} />
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.textMuted, fontSize: 13 }}>الحالة</Text>
        <Text style={{ color: d.enabled ? '#22c55e' : '#ef4444', fontSize: 13, fontWeight: '600' }}>{d.enabled ? 'مفعّلة' : 'غير مفعّلة'}</Text>
      </View>
      {!!d.method && (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>الطريقة</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{d.method}</Text>
        </View>
      )}
      {d.backupCodesRemaining !== undefined && (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>رموز الاحتياط المتبقية</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{d.backupCodesRemaining}</Text>
        </View>
      )}
      {!!d.lastUsed && (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>آخر استخدام</Text>
          <Text style={{ color: c.text, fontSize: 13 }}>{new Date(d.lastUsed).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </View>
      )}
    </ScrollView>
  );
}
