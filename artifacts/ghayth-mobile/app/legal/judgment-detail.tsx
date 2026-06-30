import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Judgment { id?: number; date?: string; outcome?: string; amount?: number; notes?: string; }

export default function LegalJudgmentDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Judgment>('/api/legal/judgments/0');
  const d = (data && !Array.isArray(data)) ? data as Judgment : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="scale" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل الحكم' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>التاريخ</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.date ? new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>النتيجة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.outcome ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المبلغ</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.amount != null ? d.amount.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الملاحظات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.notes ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
