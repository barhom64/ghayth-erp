import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingRoi {
  programId?: number;
  programName?: string;
  trainees?: number;
  cost?: number;
  completionRate?: number;
  avgScore?: number;
  roi?: number;
}

export default function TrainingRoiScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingRoi[]>('/api/bi/reports/training-roi');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل عائد التدريب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عائد الاستثمار في التدريب' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.programId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="school-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.programName ?? '—'}</Text>
              {item.roi != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: item.roi >= 0 ? '#22C55E' : '#EF4444' }}>ROI: {item.roi}%</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>متدربون: {item.trainees ?? 0}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>تكلفة: {(item.cost ?? 0).toLocaleString('ar-SA')}</Text>
              {item.completionRate != null ? <Text style={{ fontSize: 12, color: '#3B82F6' }}>إنجاز: {item.completionRate}%</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
