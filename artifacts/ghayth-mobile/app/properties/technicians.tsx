import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Technician {
  id?: number;
  name?: string;
  specialization?: string;
  status?: string;
  phone?: string;
  activeJobs?: number;
}

export default function TechniciansScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Technician[]>('/api/properties/technicians');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفنيين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفنيون' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="construct-outline" title="لا يوجد فنيون" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.specialization ? <Text style={{ fontSize: 11, color: c.brand }}>{item.specialization}</Text> : null}
              {item.activeJobs != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>مهام نشطة: {item.activeJobs}</Text> : null}
              {item.phone ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.phone}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
