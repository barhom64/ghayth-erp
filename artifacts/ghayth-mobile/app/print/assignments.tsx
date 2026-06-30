import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PrintAssignment {
  id?: number;
  branchId?: number;
  branchName?: string;
  entityType?: string;
  templateId?: number;
  templateName?: string;
  isDefault?: boolean;
}

export default function PrintAssignmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PrintAssignment[]>('/api/print/assignments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تعيينات الطباعة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعيينات قوالب الطباعة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="print-outline" title="لا توجد تعيينات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.templateName ?? '—'}</Text>
              {item.isDefault ? (
                <View style={{ backgroundColor: '#3B82F6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>افتراضي</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
              {item.entityType ?? '—'} — {item.branchName ?? 'كل الفروع'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
