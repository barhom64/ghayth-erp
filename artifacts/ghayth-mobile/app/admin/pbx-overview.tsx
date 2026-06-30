import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxOverview {
  totalExtensions?: number;
  activeExtensions?: number;
  totalCalls?: number;
  missedCalls?: number;
  ivrMenus?: number;
  recordingsCount?: number;
}

export default function AdminPbxOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PbxOverview>('/api/admin/pbx-control/overview');
  const d = (data && !Array.isArray(data)) ? data as PbxOverview : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة PBX…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const stats = [
    { label: 'الامتدادات', value: d?.totalExtensions ?? 0, color: c.brand },
    { label: 'نشطة', value: d?.activeExtensions ?? 0, color: '#22C55E' },
    { label: 'المكالمات', value: d?.totalCalls ?? 0, color: c.brand },
    { label: 'فائتة', value: d?.missedCalls ?? 0, color: '#EF4444' },
    { label: 'قوائم IVR', value: d?.ivrMenus ?? 0, color: '#8B5CF6' },
    { label: 'التسجيلات', value: d?.recordingsCount ?? 0, color: '#F59E0B' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة PBX' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {stats.map(s => (
            <View key={s.label} style={{ flex: 1, minWidth: '28%', backgroundColor: c.surface, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
