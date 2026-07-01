import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoleData { role?: string; count?: number; pending?: number; [key: string]: unknown; }

export default function DashboardRoleData() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoleData>('/api/dashboard/role-data');
  const item = (data && !Array.isArray(data)) ? data as RoleData : null;
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الدور…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيانات الدور' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {(item ? Object.entries(item) : list.flatMap(r => Object.entries(r as object))).map(([k, v], i) => (
          <View key={String(i)} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{String(v ?? '—')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
