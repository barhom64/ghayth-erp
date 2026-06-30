import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DisciplineRegulation {
  id?: number;
  title?: string;
  category?: string;
  severity?: string;
  penaltyDescription?: string;
}

export default function HrDisciplineRegulationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DisciplineRegulation[]>('/api/hr/discipline/regulation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل لائحة الجزاءات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const sevColor = (s?: string) => s === 'major' ? '#EF4444' : s === 'moderate' ? '#F59E0B' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لائحة الجزاءات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد لائحة جزاءات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.title ?? '—'}</Text>
              {item.severity ? (
                <View style={{ backgroundColor: sevColor(item.severity), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>{item.severity}</Text>
                </View>
              ) : null}
            </View>
            {item.category ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.category}</Text> : null}
            {item.penaltyDescription ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>{item.penaltyDescription}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
