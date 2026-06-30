import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DocType {
  id?: number;
  name?: string;
  isRequired?: boolean;
  hasExpiry?: boolean;
  category?: string;
}

export default function HrEmployeeDocumentTypesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DocType[]>('/api/hr/employee-document-types');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أنواع الوثائق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أنواع وثائق الموظف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="documents-outline" title="لا توجد أنواع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.category}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {item.isRequired ? <Text style={{ fontSize: 10, color: '#EF4444' }}>إلزامي</Text> : null}
              {item.hasExpiry ? <Text style={{ fontSize: 10, color: '#F59E0B' }}>له انتهاء</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
