import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Enrollment { id?: number; employeeName?: string; programName?: string; status?: string; enrolledAt?: string; completedAt?: string; score?: number; }

export default function TrainingEnrollments() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Enrollment[]>('/api/training/enrollments');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسجيلات التدريب' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="clipboard-outline" title="لا توجد تسجيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.employeeName ?? ''}</Text>
            {!!item.programName && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.programName}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
              {item.score !== undefined && <Text style={{ color: c.textMuted, fontSize: 12 }}>الدرجة: {item.score}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
