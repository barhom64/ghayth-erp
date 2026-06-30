import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface JobTitle {
  id: number;
  name?: string;
  nameEn?: string;
  department?: string;
  gradeLevel?: string;
  employeeCount?: number;
}

export default function JobTitlesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<JobTitle[]>('/api/employees/job-titles');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المسميات الوظيفية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المسميات الوظيفية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد مسميات وظيفية" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.employeeCount != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.employeeCount} موظف</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
              {item.gradeLevel ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.gradeLevel}</Text> : null}
              {item.nameEn ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.nameEn}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
