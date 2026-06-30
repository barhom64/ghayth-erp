import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnreadCount {
  total?: number;
  byFolder?: { folder: string; count: number }[];
}

export default function UnreadCountScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<UnreadCount>('/api/inbox/unread-count');
  const d = (data && !Array.isArray(data)) ? data as UnreadCount : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل الرسائل غير المقروءة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرسائل غير المقروءة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, marginBottom: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: c.textMuted }}>إجمالي غير المقروءة</Text>
          <Text style={{ fontSize: 36, fontWeight: '700', color: c.brand, marginTop: 4 }}>{d?.total ?? 0}</Text>
        </View>
        {(d?.byFolder?.length ?? 0) > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 8 }}>حسب المجلد</Text>
            {d!.byFolder!.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < d!.byFolder!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text }}>{f.folder}</Text>
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{f.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
