/**
 * تفاصيل عائلة عمرة
 * GET /api/umrah/families/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahFamily {
  id: number;
  ref?: string;
  familyName?: string;
  headName?: string;
  status?: string;
  groupId?: number;
  groupName?: string;
  memberCount?: number;
  visaStatus?: string;
  phone?: string;
  notes?: string;
  members?: { id: number; name?: string; relationship?: string; passportNumber?: string }[];
}

export default function UmrahFamilyDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: family, isLoading } = useList<UmrahFamily>(`/api/umrah/families/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات العائلة…" />;
  if (!family) return <GEmptyState icon="people-outline" title="عائلة غير موجودة" description="تعذّر العثور على بيانات العائلة" />;

  const st = statusBadge(family.status ?? '');
  const members = family.members ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: family.familyName ?? 'عائلة عمرة' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{family.familyName ?? '—'}</Text>
          {family.headName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>رب العائلة: {family.headName}</Text> : null}
          {family.groupName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{family.groupName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFF' }}>{family.memberCount ?? members.length}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>عضو</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* بيانات */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'حالة التأشيرة', value: family.visaStatus },
            { label: 'الهاتف', value: family.phone },
            { label: 'ملاحظات', value: family.notes },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.row, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, flex: 1, textAlign: 'right' }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* الأعضاء */}
        {members.length > 0 && (
          <GCard style={{ gap: 8 }}>
            <GText variant="caption" color="muted">أعضاء العائلة ({members.length})</GText>
            {members.map((m, i) => (
              <View key={m.id ?? i} style={[styles.row, { borderBottomColor: c.border }, i < members.length - 1 && { borderBottomWidth: 1, paddingBottom: 8 }]}>
                <Text style={{ fontSize: 13, color: c.textMuted }}>{m.passportNumber ?? '—'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{m.name ?? '—'}</Text>
                  {m.relationship ? <Text style={{ fontSize: 12, color: c.textMuted }}>{m.relationship}</Text> : null}
                </View>
              </View>
            ))}
          </GCard>
        )}

        <GButton title="معتمر جديد في هذه العائلة" icon="add-circle-outline" variant="secondary" onPress={() => router.push({ pathname: '/umrah/pilgrim-new' as never, params: { familyId: id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
