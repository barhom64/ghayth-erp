import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PilgrimMovement {
  pilgrimId?: number;
  pilgrimName?: string;
  groupName?: string;
  movementType?: string;
  date?: string;
  fromLocation?: string;
  toLocation?: string;
  status?: string;
}

export default function PilgrimMovementsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PilgrimMovement[]>('/api/umrah/reports/pilgrim-movements');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حركات الحجاج…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حركات الحجاج' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.pilgrimId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="walk-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.pilgrimName ?? '—'}</Text>
              {item.movementType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.movementType}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              {item.groupName ? <Text style={{ fontSize: 11, color: c.textMuted }}>المجموعة: {item.groupName}</Text> : null}
              {item.fromLocation && item.toLocation ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.fromLocation} → {item.toLocation}</Text>
              ) : null}
            </View>
            {item.date ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>
                {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
