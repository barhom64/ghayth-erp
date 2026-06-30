/**
 * لوحات المؤشرات
 * GET /api/bi/dashboards
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Dashboard {
  id: number;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  isDefault?: boolean;
  widgetCount?: number;
  lastUpdated?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const CATEGORY_ICON: Record<string, string> = {
  finance: 'cash-outline',
  hr: 'people-outline',
  fleet: 'car-outline',
  warehouse: 'cube-outline',
  properties: 'home-outline',
  projects: 'folder-outline',
  crm: 'person-outline',
  operations: 'settings-outline',
};

export default function BiDashboardsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Dashboard[]>('/api/bi/dashboards');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل اللوحات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحات المؤشرات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا توجد لوحات" description="" />}
        renderItem={({ item }) => (
          <GCard>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c.brand + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={(CATEGORY_ICON[item.category ?? ''] ?? 'grid-outline') as never} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                    {item.title ?? item.name ?? '—'}
                  </Text>
                  {item.isDefault ? (
                    <View style={{ backgroundColor: c.brand + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: c.brand }}>افتراضي</Text>
                    </View>
                  ) : null}
                </View>
                {item.category ? <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
              </View>
            </View>
            {item.description ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 8 }} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              {item.widgetCount != null ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.widgetCount} عنصر</Text>
              ) : null}
              {item.lastUpdated ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>آخر تحديث: {fmtDate(item.lastUpdated)}</Text>
              ) : null}
            </View>
          </GCard>
        )}
      />
    </View>
  );
}
