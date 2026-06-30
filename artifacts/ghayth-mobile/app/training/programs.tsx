import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingProgram { id?: number; name?: string; category?: string; status?: string; duration?: number; enrolledCount?: number; }

export default function TrainingPrograms() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingProgram[]>('/api/training/programs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'برامج التدريب' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="school-outline" title="لا توجد برامج تدريب" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.name ?? ''}</Text>
            {!!item.category && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.category}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
              {item.enrolledCount !== undefined && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.enrolledCount} مسجّل</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
