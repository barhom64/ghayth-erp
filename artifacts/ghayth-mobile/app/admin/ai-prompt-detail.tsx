import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiPrompt { id?: number; slug?: string; title?: string; version?: string; status?: string; content?: string; }

export default function AiPromptDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AiPrompt>('/api/admin/ai-governance/prompts/0');
  const d = (data && !Array.isArray(data)) ? data as AiPrompt : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.title ?? 'تفاصيل الـ Prompt' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.title ?? '-'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{d.slug} | v{d.version} | {d.status}</Text>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16, margin: 12, borderRadius: 8 }}>
        <Text style={{ color: c.text, fontSize: 13, lineHeight: 20 }}>{d.content ?? ''}</Text>
      </View>
    </ScrollView>
  );
}
