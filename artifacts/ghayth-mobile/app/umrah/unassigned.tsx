import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnassignedPilgrim {
  id?: number;
  fullName?: string;
  passportNumber?: string;
  nationality?: string;
  status?: string;
  seasonId?: number;
  createdAt?: string;
}

export default function UmrahUnassignedScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnassignedPilgrim[]>('/api/umrah/unassigned');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المعتمرين غير المسنَّدين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معتمرون غير مسنَّدين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد معتمرون غير مسنَّدين" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#F59E0B', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.fullName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.passportNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>جواز: {item.passportNumber}</Text> : null}
              {item.nationality ? <Text style={{ fontSize: 11, color: c.brand }}>{item.nationality}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
