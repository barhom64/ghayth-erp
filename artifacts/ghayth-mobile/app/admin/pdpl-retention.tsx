import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RetentionPolicy {
  id: number;
  entityType?: string;
  retentionYears?: number;
  legalBasis?: string;
  autoDeleteEnabled?: boolean;
}

export default function PdplRetentionScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RetentionPolicy[]>('/api/pdpl/retention-policies');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسات الاحتفاظ…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسات الاحتفاظ بالبيانات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد سياسات احتفاظ" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.entityType ?? '—'}</Text>
              {item.autoDeleteEnabled ? <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600' }}>حذف تلقائي</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.retentionYears != null ? <Text style={{ fontSize: 12, color: c.brand }}>{item.retentionYears} سنة</Text> : null}
              {item.legalBasis ? <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>{item.legalBasis}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
