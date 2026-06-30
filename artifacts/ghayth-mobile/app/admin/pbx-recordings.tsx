import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PbxRecording {
  id?: number;
  callId?: string;
  extension?: string;
  duration?: number;
  direction?: string;
  recordedAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PbxRecordingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PbxRecording[]>('/api/admin/pbx/recordings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تسجيلات المكالمات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسجيلات المكالمات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mic-outline" title="لا توجد تسجيلات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.callId ?? `تسجيل #${item.id}`}</Text>
              {item.duration != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.extension ? <Text style={{ fontSize: 11, color: c.textMuted }}>تحويلة: {item.extension}</Text> : null}
              {item.direction ? <Text style={{ fontSize: 11, color: c.brand }}>{item.direction === 'inbound' ? 'واردة' : 'صادرة'}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.recordedAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
