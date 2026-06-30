import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KbArticle { id?: number; title?: string; content?: string; category?: string; views?: number; }

export default function KbDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KbArticle>('/api/support/kb/0');
  const d = (data && !Array.isArray(data)) ? data as KbArticle : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="document-outline" title="لا توجد مقالة" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مقالة قاعدة المعرفة' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>العنوان</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.title ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>التصنيف</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.category ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المشاهدات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.views ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المحتوى</Text>
          <Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{d.content ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
