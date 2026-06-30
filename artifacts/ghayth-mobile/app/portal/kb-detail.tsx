import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface KbArticle { id?: number; title?: string; content?: string; category?: string; views?: number; }

export default function PortalKbDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<KbArticle>('/api/portal/kb/0');
  const d = (data && !Array.isArray(data)) ? data as KbArticle : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.title ?? 'مقالة المعرفة' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.title ?? '-'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{d.category} | {d.views ?? 0} مشاهدة</Text>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 24 }}>{d.content ?? '-'}</Text>
      </View>
    </ScrollView>
  );
}
