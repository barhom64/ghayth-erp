import React from 'react';
import { FlatList, Image, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccidentPhoto { id?: number; url?: string; caption?: string; takenAt?: string; }

export default function AccidentPhotos() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccidentPhoto[]>('/api/fleet/accidents/0/photos');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صور الحادث' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, padding: 8, flexGrow: 1 }}
        numColumns={2}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="image-outline" title="لا توجد صور" description="" />}
        renderItem={({ item }) => (
          <View style={{ flex: 1, margin: 4, backgroundColor: c.surface, borderRadius: 8, overflow: 'hidden' }}>
            {item.url ? <View style={{ height: 120, backgroundColor: c.border, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.textMuted, fontSize: 12 }}>صورة</Text></View> : null}
            {item.caption && <Text style={{ color: c.text, fontSize: 12, padding: 8 }}>{item.caption}</Text>}
          </View>
        )}
      />
    </View>
  );
}
