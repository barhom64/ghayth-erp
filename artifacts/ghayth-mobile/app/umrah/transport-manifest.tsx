import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ManifestEntry {
  id?: number;
  pilgrimName?: string;
  passportNumber?: string;
  nationality?: string;
  seatNumber?: string;
}

export default function TransportManifestScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ManifestEntry[]>('/api/umrah/transport/0/manifest');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيان الركاب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيان الركاب' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bus-outline" title="لا يوجد ركاب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.pilgrimName ?? '—'}</Text>
              {item.seatNumber ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>مقعد: {item.seatNumber}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.passportNumber ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.passportNumber}</Text> : null}
              {item.nationality ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.nationality}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
