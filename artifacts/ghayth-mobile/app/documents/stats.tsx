import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DocumentStats {
  totalDocuments?: number;
  totalFolders?: number;
  totalTemplates?: number;
  draftDocuments?: number;
  approvedDocuments?: number;
  [key: string]: unknown;
}

export default function DocumentStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<DocumentStats>('/api/documents/stats');
  const d = (data && !Array.isArray(data)) ? data as DocumentStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات المستندات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const metrics = [
    { label: 'إجمالي المستندات', value: String(d?.totalDocuments ?? 0), color: c.brand },
    { label: 'المجلدات', value: String(d?.totalFolders ?? 0), color: c.text },
    { label: 'القوالب', value: String(d?.totalTemplates ?? 0), color: c.text },
    { label: 'مسودات', value: String(d?.draftDocuments ?? 0), color: '#F59E0B' },
    { label: 'معتمدة', value: String(d?.approvedDocuments ?? 0), color: '#22C55E' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات المستندات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {metrics.map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color, marginBottom: 4 }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
