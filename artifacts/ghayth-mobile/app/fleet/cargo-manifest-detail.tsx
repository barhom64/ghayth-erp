/**
 * تفاصيل بيان الشحن
 * GET /api/cargo/manifests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface CargoManifest {
  id: number;
  manifestNumber?: string;
  ref?: string;
  linkedCustomerName?: string;
  vehiclePlate?: string;
  driverName?: string;
  origin?: string;
  destination?: string;
  pickupDate?: string;
  deliveryDate?: string;
  freightRevenue?: number;
  currency?: string;
  cargoDescription?: string;
  weight?: number;
  weightUnit?: string;
  status?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function CargoManifestDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: manifest, isLoading } = useList<CargoManifest>(`/api/cargo/manifests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الشحن…" />;
  if (!manifest) return <GEmptyState icon="cube-outline" title="بيان غير موجود" description="تعذّر العثور على بيانات بيان الشحن" />;

  const st = statusBadge(manifest.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: manifest.manifestNumber ?? manifest.ref ?? 'بيان الشحن' }} />

      <View style={[styles.header, { backgroundColor: '#0F766E' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>
            {manifest.origin ? `${manifest.origin} ← ${manifest.destination ?? ''}` : (manifest.linkedCustomerName ?? '—')}
          </Text>
          {manifest.linkedCustomerName && manifest.origin ? (
            <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{manifest.linkedCustomerName}</Text>
          ) : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {manifest.freightRevenue !== undefined && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(manifest.freightRevenue, manifest.currency)}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>أجرة الشحن</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {manifest.vehiclePlate ? (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Ionicons name="car-outline" size={22} color={c.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, marginTop: 4 }}>{manifest.vehiclePlate}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>المركبة</Text>
            </GCard>
          ) : null}
          {manifest.weight !== undefined ? (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Ionicons name="scale-outline" size={22} color={c.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, marginTop: 4 }}>
                {Number(manifest.weight).toLocaleString('ar-SA')} {manifest.weightUnit ?? 'كجم'}
              </Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>الوزن</Text>
            </GCard>
          ) : null}
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل', value: manifest.linkedCustomerName },
            { label: 'السائق', value: manifest.driverName },
            { label: 'تاريخ الاستلام', value: manifest.pickupDate ? fmtDate(manifest.pickupDate) : undefined },
            { label: 'تاريخ التسليم', value: manifest.deliveryDate ? fmtDate(manifest.deliveryDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {manifest.cargoDescription ? (
          <GCard>
            <GText variant="caption" color="muted">وصف البضاعة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{manifest.cargoDescription}</Text>
          </GCard>
        ) : null}

        {manifest.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{manifest.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="بيان شحن جديد" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/fleet/cargo-manifest-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
