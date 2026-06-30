import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NumberingHealth {
  totalSchemes?: number;
  activeSchemes?: number;
  gapsDetected?: number;
  duplicates?: number;
  lastChecked?: string;
  issues?: Array<{ scheme: string; issue: string }>;
}

export default function AdminNumberingHealthScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<NumberingHealth>('/api/numbering/health');
  const d = (data && !Array.isArray(data)) ? data as NumberingHealth : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل صحة الترقيم…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  const rows = [
    { label: 'إجمالي الخطط', value: d?.totalSchemes != null ? String(d.totalSchemes) : '—' },
    { label: 'الخطط النشطة', value: d?.activeSchemes != null ? String(d.activeSchemes) : '—' },
    { label: 'فجوات مكتشفة', value: d?.gapsDetected != null ? String(d.gapsDetected) : '—' },
    { label: 'تكرارات', value: d?.duplicates != null ? String(d.duplicates) : '—' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صحة الترقيم' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: c.text }}>{r.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.brand }}>{r.value}</Text>
          </View>
        ))}
        {d?.issues && d.issues.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444', textAlign: 'right', marginBottom: 8 }}>مشاكل مكتشفة</Text>
            {d.issues.map((iss, i) => (
              <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border, paddingTop: i > 0 ? 8 : 0, marginTop: i > 0 ? 8 : 0 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'right' }}>{iss.scheme}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right' }}>{iss.issue}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {d?.lastChecked ? (
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'center' }}>
            آخر فحص: {new Date(d.lastChecked).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
