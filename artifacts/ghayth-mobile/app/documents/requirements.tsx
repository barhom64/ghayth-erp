/**
 * متطلبات الوثائق
 * GET /api/documents/requirements
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DocumentRequirement {
  id: number;
  entityType?: string;
  documentType?: string;
  isMandatory?: boolean;
  validityDays?: number;
  description?: string;
}

export default function DocumentRequirementsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DocumentRequirement[]>('/api/documents/requirements');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل متطلبات الوثائق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'متطلبات الوثائق' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="clipboard-outline" title="لا توجد متطلبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.documentType ?? '—'}</Text>
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                backgroundColor: item.isMandatory ? '#FEE2E2' : '#F1F5F9'
              }}>
                <Text style={{ fontSize: 11, color: item.isMandatory ? '#EF4444' : '#64748B' }}>
                  {item.isMandatory ? 'إلزامي' : 'اختياري'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.entityType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.entityType}</Text> : null}
              {item.validityDays != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>صلاحية: {item.validityDays} يوم</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
