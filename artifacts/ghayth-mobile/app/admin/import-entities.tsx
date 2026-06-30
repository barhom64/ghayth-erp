import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ImportEntity {
  entity?: string;
  label?: string;
  templateAvailable?: boolean;
  description?: string;
}

export default function AdminImportEntitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ImportEntity[]>('/api/import/entities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل كيانات الاستيراد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كيانات الاستيراد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.entity ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cloud-upload-outline" title="لا توجد كيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.label ?? item.entity ?? '—'}</Text>
              {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.description}</Text> : null}
            </View>
            {item.templateAvailable ? (
              <Text style={{ fontSize: 10, color: '#22C55E', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>قالب</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
