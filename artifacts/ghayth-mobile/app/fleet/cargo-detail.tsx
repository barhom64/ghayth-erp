/**
 * تفاصيل بيان الشحن
 * GET /api/cargo/manifests/:id
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useRefresh } from '@/hooks/useRefresh';
import { statusBadge } from '@/lib/moduleSections';

interface ManifestItem {
  id: number;
  description?: string;
  quantity?: number;
  weight?: number;
  unit?: string;
  status?: string;
}

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
  notes?: string;
  items?: ManifestItem[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return val; }
}

export default function CargoDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useList<Manifest>(`/api/cargo/manifests/${id}`);
  const { refreshing, onRefresh } = useRefresh([[`/api/cargo/manifests/${id}`]]);

  const manifest = Array.isArray(data) ? data[0] : data as Manifest | null;
  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;
  if (isError || !manifest) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" />;

  const st = statusBadge(manifest.status ?? '');
  const items: ManifestItem[] = Array.isArray(manifest.items) ? manifest.items : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: manifest.manifestNumber ?? `شحنة #${id}` }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GCard style={{ gap: 0, padding: 0 }}>
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
              {manifest.manifestNumber ?? `#${id}`}
            </Text>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
          </View>
          {[
            { label: 'المصدر', value: manifest.origin },
            { label: 'الوجهة', value: manifest.destination },
            { label: 'السائق', value: manifest.driverName },
            { label: 'المركبة', value: manifest.vehiclePlate },
            { label: 'تاريخ الجدولة', value: fmtDate(manifest.scheduledDate) },
            { label: 'تاريخ التسليم', value: fmtDate(manifest.deliveredDate) },
            { label: 'عدد البنود', value: String(manifest.totalItems ?? 0) },
            { label: 'الوزن الإجمالي', value: manifest.totalWeight ? `${manifest.totalWeight} كغ` : '—' },
          ].map(row => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }]}>
              <Text style={{ fontSize: 13, color: c.text, flex: 1 }}>{row.value ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            </View>
          ))}
          {manifest.notes ? (
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{manifest.notes}</Text>
            </View>
          ) : null}
        </GCard>

        {items.length > 0 && (
          <GCard style={{ gap: 0, padding: 0 }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>البنود</Text>
            </View>
            {items.map((item, i) => (
              <View
                key={item.id}
                style={[styles.itemRow, { borderBottomColor: c.border, borderBottomWidth: i === items.length - 1 ? 0 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{item.description ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                    الكمية: {item.quantity ?? 0} {item.unit ?? ''} · الوزن: {item.weight ?? 0} كغ
                  </Text>
                </View>
              </View>
            ))}
          </GCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1 },
  itemRow: { padding: 12 },
});
