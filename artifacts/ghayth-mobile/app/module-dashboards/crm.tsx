import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ModuleDashboard { title?: string; value?: string | number; trend?: string; }

export default function CrmModuleDashboard() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ModuleDashboard>('/api/module-dashboards/crm');
  const d = (data && !Array.isArray(data)) ? data as ModuleDashboard : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة CRM' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>ملخص وحدة إدارة العملاء</Text>
        {d?.value !== undefined && (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{d.title ?? 'القيمة'}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{String(d.value)}</Text>
            {d.trend && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{d.trend}</Text>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
