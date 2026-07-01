import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FieldEligibility { eligible?: boolean; reason?: string; method?: string; radius?: number; }

export default function FieldEligibilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FieldEligibility>('/api/my/field/eligibility');
  const info = (data && !Array.isArray(data)) ? data as FieldEligibility : null;
  if (isLoading) return <GLoadingState text="جارٍ التحقق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحقق" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أهلية الحضور الميداني' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {info ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 48 }}>{info.eligible ? '✅' : '❌'}</Text>
              <Text style={{ color: info.eligible ? c.brand : '#ef4444', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                {info.eligible ? 'مؤهّل للتسجيل' : 'غير مؤهّل للتسجيل'}
              </Text>
            </View>
            {!!info.reason && <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center' }}>{info.reason}</Text>}
            {!!info.method && <Text style={{ color: c.textFaint, fontSize: 13, textAlign: 'center', marginTop: 8 }}>الطريقة: {info.method}</Text>}
            {info.radius != null && <Text style={{ color: c.textFaint, fontSize: 13, textAlign: 'center', marginTop: 4 }}>النطاق: {info.radius} م</Text>}
          </View>
        ) : <GEmptyState icon="location-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
