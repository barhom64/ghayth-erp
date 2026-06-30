/**
 * تفاصيل ملف المالك
 * GET /api/properties/owners/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GAvatar, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PropertyOwner {
  id: number;
  name?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  nationalId?: string;
  status?: string;
  unitCount?: number;
  totalRentValue?: number;
  currency?: string;
  address?: string;
  notes?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function OwnerDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: owner, isLoading } = useList<PropertyOwner>(`/api/properties/owners/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملف المالك…" />;
  if (!owner) return <GEmptyState icon="people-circle-outline" title="مالك غير موجود" description="تعذّر العثور على بيانات المالك" />;

  const st = statusBadge(owner.status ?? '');
  const displayName = owner.name ?? owner.ownerName ?? '—';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: displayName }} />

      <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{displayName}</Text>
          {owner.phone ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{owner.phone}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <GAvatar name={displayName} size="lg" />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(owner.unitCount !== undefined || owner.totalRentValue !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {owner.unitCount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#7C3AED' }}>{owner.unitCount}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>وحدة مُدارة</Text>
              </GCard>
            )}
            {owner.totalRentValue !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#16A34A' }}>{fmtMoney(owner.totalRentValue, owner.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>إجمالي الإيجار</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم الجوال', value: owner.phone },
            { label: 'البريد الإلكتروني', value: owner.email },
            { label: 'رقم الهوية', value: owner.nationalId },
            { label: 'العنوان', value: owner.address },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {owner.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{owner.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="عقار جديد لهذا المالك" icon="home-outline" variant="secondary" onPress={() => router.push({ pathname: '/properties/property-new' as never, params: { ownerId: id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
