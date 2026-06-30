/**
 * مطالبات الذكاء الاصطناعي
 * GET /api/admin/ai-governance/prompts
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AiPrompt {
  id: number;
  slug?: string;
  description?: string;
  modelProvider?: string;
  version?: number;
  isActive?: boolean;
  updatedAt?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function AiPromptsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AiPrompt[]>('/api/admin/ai-governance/prompts');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مطالبات الذكاء الاصطناعي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مطالبات الذكاء الاصطناعي' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="sparkles-outline" title="لا توجد مطالبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.slug ?? '—'}</Text>
              <View style={{ flex: 1 }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.modelProvider ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.modelProvider}</Text> : null}
              {item.version != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>v{item.version}</Text> : null}
              {item.updatedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.updatedAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
