import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Activity { id?: number; title?: string; type?: string; date?: string; }

export default function OpportunityActivitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Activity[]>('/api/crm/opportunities/0/activities');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أنشطة الفرصة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-clear-outline" title="لا توجد أنشطة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.title ?? String(item.id ?? '')}</Text>
            {item.type && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.type}</Text>}
            {item.date && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
