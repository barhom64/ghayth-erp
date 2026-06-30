import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NavInfo { id?: number; origin?: string; destination?: string; route?: string; }

export default function DispatchNavigationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NavInfo>('/api/transport/dispatch-orders/0/navigation');
  const d = (data && !Array.isArray(data)) ? data as NavInfo : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنقل أمر الإرسال' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!d ? (
          <GEmptyState icon="compass-outline" title="لا توجد بيانات" description="" />
        ) : (
          <>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>نقطة الانطلاق</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.origin ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الوجهة</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.destination ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>المسار</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.route ?? '—'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
