/**
 * تفاصيل الباقة العمرة
 * GET /api/umrah/packages/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahPackage {
  id: number;
  ref?: string;
  name?: string;
  season?: string;
  status?: string;
  packageType?: string;
  departureCity?: string;
  duration?: number;
  pricePerPerson?: number;
  currency?: string;
  capacity?: number;
  enrolled?: number;
  hotel?: string;
  hotelStars?: number;
  transport?: string;
  visa?: boolean;
  departureDate?: string;
  returnDate?: string;
  description?: string;
  includes?: string[];
  excludes?: string[];
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

export default function UmrahPackageDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: pkg, isLoading } = useList<UmrahPackage>(`/api/umrah/packages/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الباقة…" />;
  if (!pkg) return <GEmptyState icon="moon-outline" title="باقة غير موجودة" description="تعذّر العثور على بيانات الباقة" />;

  const ref = pkg.ref ?? `#${pkg.id}`;
  const st = statusBadge(pkg.status ?? '');
  const fillPct = pkg.capacity ? Math.round(((pkg.enrolled ?? 0) / pkg.capacity) * 100) : 0;
  const includes = pkg.includes ?? [];
  const excludes = pkg.excludes ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: pkg.name ?? 'الباقة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#059669' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{pkg.name ?? '—'}</Text>
          {pkg.season ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{pkg.season}</Text> : null}
          {pkg.packageType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{pkg.packageType}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {pkg.duration ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF' }}>{pkg.duration} يوم</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(pkg.pricePerPerson, pkg.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>للفرد</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF', marginTop: 4 }}>{pkg.enrolled ?? 0}/{pkg.capacity ?? '—'}</Text>
          <Text style={{ fontSize: 10, color: '#FFFFFFAA' }}>مسجل</Text>
        </View>
      </View>

      {/* شريط الإشغال */}
      {pkg.capacity ? (
        <View style={{ height: 6, backgroundColor: c.border }}>
          <View style={{ height: 6, width: `${fillPct}%`, backgroundColor: fillPct >= 90 ? '#EF4444' : '#22C55E' }} />
        </View>
      ) : null}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'مدينة المغادرة', value: pkg.departureCity },
            { label: 'تاريخ المغادرة', value: pkg.departureDate ? fmtDate(pkg.departureDate) : undefined },
            { label: 'تاريخ العودة', value: pkg.returnDate ? fmtDate(pkg.returnDate) : undefined },
            { label: 'الفندق', value: pkg.hotel },
            { label: 'تصنيف الفندق', value: pkg.hotelStars ? '⭐'.repeat(pkg.hotelStars) : undefined },
            { label: 'وسيلة النقل', value: pkg.transport },
            { label: 'يشمل التأشيرة', value: pkg.visa !== undefined ? (pkg.visa ? 'نعم' : 'لا') : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {pkg.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{pkg.description}</Text>
          </GCard>
        ) : null}

        {includes.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">يشمل</GText>
            {includes.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={{ fontSize: 13, color: c.text }}>{item}</Text>
              </View>
            ))}
          </GCard>
        )}

        <GButton title="إنشاء مجموعة عمرة" icon="add-circle-outline" variant="secondary" onPress={() => router.push({ pathname: '/umrah/group-detail' as never, params: { packageId: id } })} style={{ marginBottom: 8 }} />

        {excludes.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">لا يشمل</GText>
            {excludes.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={{ fontSize: 13, color: c.text }}>{item}</Text>
              </View>
            ))}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
