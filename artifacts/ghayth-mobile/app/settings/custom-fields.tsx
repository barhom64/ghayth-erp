/**
 * الحقول المخصصة
 * GET /api/custom-fields/definitions
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GCard } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustomFieldDef {
  id: number;
  name?: string;
  label?: string;
  entityType?: string;
  fieldType?: string;
  required?: boolean;
  isActive?: boolean;
  options?: string[];
}

const FIELD_TYPE_ICON: Record<string, string> = {
  text: 'text-outline',
  number: 'calculator-outline',
  date: 'calendar-outline',
  select: 'list-outline',
  boolean: 'toggle-outline',
  textarea: 'document-text-outline',
};

export default function CustomFieldsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustomFieldDef[]>('/api/custom-fields/definitions');
  const list = Array.isArray(data) ? data : [];

  // Group by entity type
  const entities = [...new Set(list.map(f => f.entityType ?? 'عام'))];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحقول المخصصة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحقول المخصصة' }} />
      <FlatList
        data={entities}
        keyExtractor={e => e}
        contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="options-outline" title="لا توجد حقول مخصصة" description="" />}
        renderItem={({ item: entity }) => {
          const fields = list.filter(f => (f.entityType ?? 'عام') === entity);
          return (
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textAlign: 'right', marginBottom: 8 }}>{entity}</Text>
              <GCard style={{ gap: 0, padding: 0 }}>
                {fields.map((field: CustomFieldDef, i: number) => (
                  <View
                    key={field.id}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i === fields.length - 1 ? 0 : 1, borderBottomColor: c.border, gap: 10 }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: field.isActive ? '#22C55E' : '#94A3B8' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>
                        {field.label ?? field.name ?? '—'}
                        {field.required ? ' *' : ''}
                      </Text>
                      <View style={{ flexDirection: 'row-reverse', gap: 6, marginTop: 2 }}>
                        <Ionicons name={(FIELD_TYPE_ICON[field.fieldType ?? ''] ?? 'help-circle-outline') as never} size={12} color={c.textMuted} />
                        <Text style={{ fontSize: 11, color: c.textMuted }}>{field.fieldType ?? '—'}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </GCard>
            </View>
          );
        }}
      />
    </View>
  );
}
