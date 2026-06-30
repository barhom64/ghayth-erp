import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeDocument {
  id?: number;
  employeeName?: string;
  documentType?: string;
  documentNumber?: string;
  expiryDate?: string;
  isExpired?: boolean;
}

export default function HrEmployeeDocumentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeDocument[]>('/api/hr/employee-documents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل وثائق الموظفين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وثائق الموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد وثائق" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.isExpired ? (
                <Text style={{ fontSize: 10, color: '#EF4444', backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>منتهية</Text>
              ) : null}
            </View>
            {item.documentType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.documentType}</Text> : null}
            {item.documentNumber ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{item.documentNumber}</Text> : null}
            {item.expiryDate ? (
              <Text style={{ fontSize: 11, color: item.isExpired ? '#EF4444' : c.textFaint, marginTop: 4 }}>
                الانتهاء: {new Date(item.expiryDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
