/**
 * بيانات البضائع والشحنات
 * GET /api/cargo/manifests
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Manifest {
  id: number;
  manifestNumber?: string;
  origin?: string;
  destination?: string;
  driverName?: string;
  vehiclePlate?: string;
  totalItems?: number;
  totalWeight?: number;
  status?: string;
  scheduledDate?: string;
  deliveredDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function CargoScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Manifest[]>('/api/cargo/manifests');
  const manifests = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الشحن…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بيانات الشحن والبضائع' }} />
      <FlatList
        data={manifests}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="cube-outline" title="لا توجد شحنات" description="لا توجد بيانات بضائع مسجّلة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          return (
            <Pressable
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderBottomColor: c.border }]}
              onPress={() => router.push({ pathname: '/fleet/cargo-detail' as never, params: { id: String(item.id) } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.manifestNumber ?? `#${item.id}`}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.origin ?? '—'} → {item.destination ?? '—'}
                </Text>
                <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>
                  {item.vehiclePlate ?? ''} · {fmtDate(item.scheduledDate)} · {item.totalItems ?? 0} بند
                </Text>
              </View>
              {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
