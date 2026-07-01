import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Party360 { id?: number; name?: string; type?: string; totalTransactions?: number; totalAmount?: number; lastActivity?: string; [key: string]: unknown; }

export default function Party360() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Party360>(`/api/parties/${id ?? ''}/360`);
  const party = (data && !Array.isArray(data)) ? data as Party360 : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل ملف الطرف…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: party?.name ?? 'ملف 360° للطرف' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {party ? Object.entries(party).filter(([k]) => !['id'].includes(k)).map(([k, v]) => (
          <View key={k} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
            <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{typeof v === 'number' ? v.toLocaleString('ar-SA') : String(v ?? '—')}</Text>
          </View>
        )) : <GEmptyState icon="person-circle-outline" title="لا توجد بيانات" description="" />}
      </ScrollView>
    </View>
  );
}
