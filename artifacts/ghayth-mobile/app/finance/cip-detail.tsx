import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CipItem { id?: number; name?: string; cost?: number; status?: string; startDate?: string; }

export default function CipDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CipItem>('/api/finance/cip/0');
  const d = (data && !Array.isArray(data)) ? data as CipItem : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="cube-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل العمل الجاري' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الاسم</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.name ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>التكلفة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.cost != null ? d.cost.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.status ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>تاريخ البدء</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.startDate ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
