import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExemptPilgrim {
  id?: number;
  fullName?: string;
  passportNumber?: string;
  nationality?: string;
  exemptionReason?: string;
  status?: string;
  seasonId?: number;
}

export default function ExemptPilgrimsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExemptPilgrim[]>('/api/umrah/reports/exempt-pilgrims');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المعتمرين المعفيين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المعتمرون المعفيون' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد معتمرون معفيون" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.fullName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.passportNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>جواز: {item.passportNumber}</Text> : null}
              {item.exemptionReason ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>{item.exemptionReason}</Text> : null}
              {item.nationality ? <Text style={{ fontSize: 11, color: c.brand }}>{item.nationality}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
