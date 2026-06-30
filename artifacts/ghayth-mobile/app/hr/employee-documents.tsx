import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmpDoc { id?: number; name?: string; type?: string; expiryDate?: string; }

export default function EmployeeDocumentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmpDoc[]>('/api/employees/documents');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وثائق الموظفين' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد وثائق" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
            {item.type && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.type}</Text>}
            {item.expiryDate && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                الانتهاء: {new Date(item.expiryDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
