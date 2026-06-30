/**
 * كتالوج الطلبات
 * GET /api/requests/catalog
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RequestCatalogItem {
  id: number;
  name?: string;
  category?: string;
  description?: string;
  estimatedDays?: number;
  isActive?: boolean;
  requiresApproval?: boolean;
}

export default function RequestCatalogScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RequestCatalogItem[]>('/api/requests/catalog');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل كتالوج الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كتالوج الطلبات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="apps-outline" title="لا توجد أنواع طلبات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#94A3B8' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand }}>{item.category}</Text> : null}
              {item.estimatedDays != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.estimatedDays} أيام</Text> : null}
              {item.requiresApproval ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>يتطلب اعتمادًا</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
