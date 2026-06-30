import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IvrMenu { id?: number; name?: string; greeting?: string; optionsCount?: number; language?: string; }

export default function PbxIvrDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IvrMenu>('/api/admin/pbx/ivr-menus/0');
  const d = (data && !Array.isArray(data)) ? data as IvrMenu : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الاسم', d.name ?? '-'],
    ['اللغة', d.language ?? '-'],
    ['عدد الخيارات', String(d.optionsCount ?? 0)],
    ['رسالة الترحيب', d.greeting ?? '-'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قائمة IVR' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
