import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScorecardEntry { rank?: number; driverId?: number; driverName?: string; score?: number; violations?: number; }

export default function TelematicsScorecardLeaderboard() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScorecardEntry[]>('/api/fleet/telematics/drivers/scorecard-leaderboard');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة الصدارة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.driverId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trophy-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center' }}>
            <Text style={{ color: c.textMuted, fontSize: 16, fontWeight: '700', width: 32 }}>{item.rank ?? ''}</Text>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.driverName ?? String(item.driverId ?? '')}</Text>
              {item.violations !== undefined && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>المخالفات: {item.violations}</Text>}
            </View>
            {item.score !== undefined && <Text style={{ color: c.brand, fontSize: 18, fontWeight: '700' }}>{item.score}</Text>}
          </View>
        )}
      />
    </View>
  );
}
