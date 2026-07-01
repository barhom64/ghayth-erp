import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Party360 { id?: number; type?: string; name?: string; email?: string; phone?: string; address?: string; relatedEntities?: Array<{ type?: string; id?: number; name?: string }> }

export default function Party360() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useList<Party360>(`/api/parties/${id ?? '0'}/360`);
  const d = (data && !Array.isArray(data)) ? data as Party360 : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'ملف الطرف 360°' }} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{d.name ?? ''}</Text>
      {!!d.type && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>{d.type}</Text>}
      {!!d.email && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>{d.email}</Text>}
      {!!d.phone && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>{d.phone}</Text>}
      {!!d.address && <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 12 }}>{d.address}</Text>}
      {Array.isArray(d.relatedEntities) && d.relatedEntities.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>الكيانات المرتبطة</Text>
          {d.relatedEntities.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{e.name ?? ''}</Text>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{e.type ?? ''}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
