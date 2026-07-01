import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NumberingPreview { nextNumber?: string; pattern?: string; example?: string; }

export default function NumberingPreviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NumberingPreview>('/api/numbering/preview');
  const preview = (data && !Array.isArray(data)) ? data as NumberingPreview : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة الترقيم' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {preview ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            {!!preview.pattern && <View style={{ marginBottom: 12 }}><Text style={{ color: c.textMuted, fontSize: 12 }}>النمط</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{preview.pattern}</Text></View>}
            {!!preview.nextNumber && <View style={{ marginBottom: 12 }}><Text style={{ color: c.textMuted, fontSize: 12 }}>الرقم التالي</Text><Text style={{ color: c.brand, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{preview.nextNumber}</Text></View>}
            {!!preview.example && <View><Text style={{ color: c.textMuted, fontSize: 12 }}>مثال</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{preview.example}</Text></View>}
          </View>
        ) : <GEmptyState icon="list-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
