/**
 * امتدادات PBX
 * GET /api/admin/pbx/extensions
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxExtension {
  id: number;
  extensionNumber?: string;
  assignedTo?: string;
  department?: string;
  status?: string;
  voicemailEnabled?: boolean;
}

export default function PbxExtensionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxExtension[]>('/api/admin/pbx/extensions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الامتدادات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'امتدادات PBX' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="call-outline" title="لا توجد امتدادات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.extensionNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.assignedTo ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
              {item.voicemailEnabled ? <Text style={{ fontSize: 11, color: '#22C55E' }}>بريد صوتي</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
