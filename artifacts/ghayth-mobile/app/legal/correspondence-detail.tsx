import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Corr { id?: number; subject?: string; date?: string; direction?: string; content?: string; }

export default function LegalCorrespondenceDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Corr>('/api/legal/correspondence/0');
  const d = (data && !Array.isArray(data)) ? data as Corr : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="mail-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفاصيل المراسلة' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الموضوع</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.subject ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>التاريخ</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.date ? new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الاتجاه</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.direction ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المحتوى</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.content ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
