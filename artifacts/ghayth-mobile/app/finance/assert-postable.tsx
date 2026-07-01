import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PostableCheck { isPostable?: boolean; reason?: string; missingSetup?: string[]; warnings?: string[]; }

export default function AssertPostable() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PostableCheck>('/api/accounting-engine/assert-postable');
  const d = (data && !Array.isArray(data)) ? data as PostableCheck : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'التحقق من قابلية الترحيل' }} />
      <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 40 }}>{d.isPostable ? '✅' : '❌'}</Text>
        <Text style={{ color: d.isPostable ? '#22c55e' : '#ef4444', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
          {d.isPostable ? 'قابل للترحيل' : 'غير قابل للترحيل'}
        </Text>
        {!!d.reason && <Text style={{ color: c.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>{d.reason}</Text>}
      </View>
      {Array.isArray(d.missingSetup) && d.missingSetup.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>إعداد مفقود</Text>
          {d.missingSetup.map((s, i) => <Text key={i} style={{ color: '#ef4444', fontSize: 13, paddingVertical: 4 }}>• {s}</Text>)}
        </View>
      )}
      {Array.isArray(d.warnings) && d.warnings.length > 0 && (
        <View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>تحذيرات</Text>
          {d.warnings.map((w, i) => <Text key={i} style={{ color: '#f59e0b', fontSize: 13, paddingVertical: 4 }}>• {w}</Text>)}
        </View>
      )}
    </ScrollView>
  );
}
