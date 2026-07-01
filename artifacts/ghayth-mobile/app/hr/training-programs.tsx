import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingProgram { id?: number; name?: string; duration?: number; provider?: string; enrolledCount?: number; }

export default function TrainingProgramsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingProgram[]>('/api/hr/training/programs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'برامج التدريب' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="school-outline" title="لا توجد برامج تدريب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.name ?? ''}</Text>
            {!!item.provider && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.provider}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {item.duration != null && <Text style={{ color: c.textFaint, fontSize: 12 }}>{item.duration} ساعة</Text>}
              {item.enrolledCount != null && <Text style={{ color: c.brand, fontSize: 12 }}>{item.enrolledCount} مسجّل</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
