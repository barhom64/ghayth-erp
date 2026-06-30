/**
 * تفاصيل المعتمر — بطاقة كاملة
 * GET /api/umrah/pilgrims/:id
 * GET /api/umrah/pilgrims/:id/payments?pageSize=10
 * GET /api/umrah/pilgrims/:id/documents?pageSize=10
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

type Tab = 'info' | 'payments' | 'documents';

interface Pilgrim {
  id: number;
  name?: string;
  fullName?: string;
  passportNumber?: string;
  nationalId?: string;
  nationality?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  status?: string;
  groupName?: string;
  seasonName?: string;
  packageName?: string;
  visaNumber?: string;
  visaStatus?: string;
  flightNumber?: string;
  departureDate?: string;
  returnDate?: string;
  mahramName?: string;
  totalPrice?: number;
  paid?: number;
  remaining?: number;
  agentName?: string;
  notes?: string;
}

interface Payment {
  id: number;
  amount?: number;
  method?: string;
  date?: string;
  reference?: string;
  status?: string;
}

interface Document {
  id: number;
  name?: string;
  type?: string;
  expiryDate?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ر.س';
}

export default function PilgrimDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: pilgrim, isLoading: pilgrimLoading } = useList<Pilgrim>(`/api/umrah/pilgrims/${id}`);
  const { data: paymentsResp, isLoading: payLoading } = useList<{ data?: Payment[] }>(
    `/api/umrah/pilgrims/${id}/payments`, { pageSize: 10 }, { enabled: tab === 'payments' }
  );
  const { data: docsResp, isLoading: docsLoading } = useList<{ data?: Document[] }>(
    `/api/umrah/pilgrims/${id}/documents`, { pageSize: 10 }, { enabled: tab === 'documents' }
  );

  if (pilgrimLoading) return <GLoadingState text="جارٍ تحميل بيانات المعتمر…" />;
  if (!pilgrim) return <GEmptyState icon="person-outline" title="معتمر غير موجود" description="تعذّر العثور على بيانات المعتمر" />;

  const name = pilgrim.name ?? pilgrim.fullName ?? '—';
  const st = statusBadge(pilgrim.status ?? '');
  const paidPct = pilgrim.totalPrice && pilgrim.paid ? Math.min((pilgrim.paid / pilgrim.totalPrice) * 100, 100) : 0;

  const TABS: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'info', label: 'البيانات', icon: 'person-outline' },
    { key: 'payments', label: 'الدفعات', icon: 'cash-outline' },
    { key: 'documents', label: 'الوثائق', icon: 'document-text-outline' },
  ];

  const payments = paymentsResp?.data ?? [];
  const documents = docsResp?.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <GAvatar name={name} size="lg" />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {pilgrim.groupName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{pilgrim.groupName}</Text> : null}
          {pilgrim.seasonName ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{pilgrim.seasonName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {/* ملخص مالي */}
      {pilgrim.totalPrice !== undefined && (
        <View style={[styles.finRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <View style={styles.finBox}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>الإجمالي</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'center' }}>{fmtMoney(pilgrim.totalPrice)}</Text>
          </View>
          <View style={[styles.finDivider, { backgroundColor: c.border }]} />
          <View style={styles.finBox}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>المدفوع</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E', textAlign: 'center' }}>{fmtMoney(pilgrim.paid)}</Text>
          </View>
          <View style={[styles.finDivider, { backgroundColor: c.border }]} />
          <View style={styles.finBox}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>المتبقي</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: (pilgrim.remaining ?? 0) > 0 ? '#EF4444' : c.textMuted, textAlign: 'center' }}>{fmtMoney(pilgrim.remaining)}</Text>
          </View>
        </View>
      )}

      {/* شريط التقدم */}
      {pilgrim.totalPrice !== undefined && (
        <View style={[styles.progressWrap, { backgroundColor: c.surface }]}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: paidPct >= 100 ? '#22C55E' : c.brand }]} />
          </View>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{paidPct.toFixed(0)}% مدفوع</Text>
        </View>
      )}

      {/* تبويبات */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Ionicons name={t.icon as never} size={16} color={tab === t.key ? c.brand : c.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted, marginRight: 4 }}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'info' && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'رقم الجواز', value: pilgrim.passportNumber },
              { label: 'رقم الهوية', value: pilgrim.nationalId },
              { label: 'الجنسية', value: pilgrim.nationality },
              { label: 'الجنس', value: pilgrim.gender },
              { label: 'تاريخ الميلاد', value: fmtDate(pilgrim.birthDate) },
              { label: 'الجوال', value: pilgrim.phone },
              { label: 'البريد', value: pilgrim.email },
              { label: 'الباقة', value: pilgrim.packageName },
              { label: 'رقم التأشيرة', value: pilgrim.visaNumber },
              { label: 'حالة التأشيرة', value: pilgrim.visaStatus },
              { label: 'رقم الرحلة', value: pilgrim.flightNumber },
              { label: 'تاريخ المغادرة', value: fmtDate(pilgrim.departureDate) },
              { label: 'تاريخ العودة', value: fmtDate(pilgrim.returnDate) },
              { label: 'المحرم', value: pilgrim.mahramName },
              { label: 'المسوّق', value: pilgrim.agentName },
              { label: 'ملاحظات', value: pilgrim.notes },
            ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
              <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 100, textAlign: 'right' }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        {tab === 'payments' && (
          <>
          <GButton
            title="تسجيل دفعة جديدة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/umrah/payment-new' as never, params: { pilgrimId: id } })}
            style={{ marginBottom: 8 }}
          />
          {payLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          payments.length === 0 ? <GEmptyState icon="barcode-outline" title="لا دفعات" description="لم يتم تسجيل أي دفعات لهذا المعتمر" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {payments.map((p, i) => {
              const st = statusBadge(p.status ?? '');
              return (
                <View key={p.id} style={[styles.listRow, { borderBottomColor: c.border }, i === payments.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#22C55E', textAlign: 'right' }}>{fmtMoney(p.amount)}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                      {fmtDate(p.date)}{p.method ? ` · ${p.method}` : ''}{p.reference ? ` · ${p.reference}` : ''}
                    </Text>
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>}
          </>
        )}

        {tab === 'documents' && (
          docsLoading ? <ActivityIndicator color={c.brand} style={{ marginTop: 40 }} /> :
          documents.length === 0 ? <GEmptyState icon="document-text-outline" title="لا وثائق" description="لم يتم رفع أي وثائق لهذا المعتمر" /> :
          <GCard style={{ gap: 0, padding: 0 }}>
            {documents.map((doc, i) => {
              const st = statusBadge(doc.status ?? '');
              const isExpiring = doc.expiryDate && new Date(doc.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              return (
                <View key={doc.id} style={[styles.listRow, { borderBottomColor: c.border }, i === documents.length - 1 && { borderBottomWidth: 0 }]}>
                  <Ionicons name="document-outline" size={20} color={isExpiring ? '#EF4444' : c.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{doc.name ?? doc.type ?? '—'}</Text>
                    {doc.expiryDate ? <Text style={{ fontSize: 12, color: isExpiring ? '#EF4444' : c.textMuted, textAlign: 'right' }}>تنتهي: {fmtDate(doc.expiryDate)}</Text> : null}
                  </View>
                  {st && <GStatusBadge status={st.label} size="sm" />}
                </View>
              );
            })}
          </GCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20 },
  finRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  finBox: { flex: 1, gap: 4 },
  finDivider: { width: 1, height: 40, marginHorizontal: 8 },
  progressWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  tabBar: { borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
